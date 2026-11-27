// Drains the email outbox into the provider's HTTP API. Called by pg_cron through pg_net.
// Thin Deno glue only: the message building and the batch logic live in lib.ts, where lint, tsc
// and vitest cover it — index.ts is excluded from both by tsconfig.json:34 and eslint.config.mjs:5.
import { createClient } from "npm:@supabase/supabase-js@2";
import { postEmail, processRows, type EmailRow } from "./lib.ts";

// Supabase's Edge runtime global: keeps the isolate alive after the response is sent.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("EMAIL_NOTIFY_SECRET") ?? "";
  const given = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(given, secret)) return new Response("unauthorized", { status: 401 });

  const apiKey = Deno.env.get("BREVO_API_KEY") ?? "";
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "";
  // Unconfigured is not "nothing to do": answering 500 before the claim leaves every row untouched
  // and unspent, which is what makes this function safe to deploy before the credential exists.
  if (!apiKey || !senderEmail) {
    console.error("email-notify is not configured: set the BREVO_* function secrets");
    return new Response("not configured", { status: 500 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.rpc("email_notify_claim", { p_limit: 10 });
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []) as EmailRow[];

  const work = processRows(rows, {
    sender: { name: Deno.env.get("BREVO_SENDER_NAME") || "Away", email: senderEmail },
    siteUrl: Deno.env.get("SITE_URL") ?? "",
    apiKey,
    send: postEmail,
    finish: async (row, outcome, detail) => {
      const { error: finishError } = await db.rpc("email_notify_finish", {
        p_id: row.id,
        p_outcome: outcome,
        p_error: detail,
        p_attempts: row.attempts,
      });
      return finishError ? finishError.message : null;
    },
    log: (message) => console.error(message),
  }).then(
    (counts) => {
      console.log(JSON.stringify(counts));
      return counts;
    },
    (e: unknown) => {
      console.error(`email-notify batch failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    },
  );

  // Answer pg_net straight away (it only waits a few seconds) and finish the batch in the background.
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(work);
    return Response.json({ claimed: rows.length }, { status: 202 });
  }
  const counts = await work;
  return counts ? Response.json(counts) : new Response("batch failed", { status: 500 });
});

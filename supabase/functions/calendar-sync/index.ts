// Drains the calendar outbox into Google Calendar. Called by pg_cron through pg_net.
// Thin Deno glue only: the batch logic lives in lib.ts, where lint, tsc and vitest cover it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { processRows, serviceAccountToken, type SyncRow } from "./lib.ts";

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
  const secret = Deno.env.get("CALENDAR_SYNC_SECRET") ?? "";
  const given = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(given, secret)) return new Response("unauthorized", { status: 401 });

  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ?? "";
  const key = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") ?? "";
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "";
  if (!email || !key || !calendarId) {
    console.error("calendar-sync is not configured: set the GOOGLE_* function secrets");
    return new Response("not configured", { status: 500 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.rpc("calendar_sync_claim", { p_limit: 10 });
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []) as SyncRow[];

  const work = processRows(rows, {
    calendarId,
    getToken: () => serviceAccountToken(email, key),
    finish: async (row, outcome, detail) => {
      const { error: finishError } = await db.rpc("calendar_sync_finish", {
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
      console.error(`calendar-sync batch failed: ${e instanceof Error ? e.message : String(e)}`);
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

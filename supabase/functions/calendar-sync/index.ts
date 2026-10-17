// Drains the calendar outbox into Google Calendar. Called by pg_cron through pg_net.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildEvent, classify, eventId, serviceAccountToken, type Outcome, type SyncRow } from "./lib.ts";

const API = "https://www.googleapis.com/calendar/v3/calendars";

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
  if (!email || !key || !calendarId) return new Response("not configured", { status: 500 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.rpc("calendar_sync_claim", { p_limit: 20 });
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []) as SyncRow[];
  const counts: Record<Outcome, number> = { done: 0, retry: 0, fail: 0 };
  if (rows.length === 0) return Response.json(counts);

  let token: string | null = null;
  let tokenError = "";
  try {
    token = await serviceAccountToken(email, key);
  } catch (e) {
    tokenError = e instanceof Error ? e.message : String(e);
  }

  for (const row of rows) {
    let outcome: Outcome;
    let detail: string | null = null;

    if (row.action === "create" && (row.full_name === null || row.start_date === null || row.end_date === null)) {
      outcome = "done"; // the request is gone; its delete row follows
    } else if (!token) {
      outcome = "retry";
      detail = tokenError;
    } else {
      try {
        const base = `${API}/${encodeURIComponent(calendarId)}/events`;
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const res =
          row.action === "create"
            ? await fetch(base, {
                method: "POST",
                headers,
                body: JSON.stringify(
                  buildEvent({
                    request_id: row.request_id,
                    full_name: row.full_name!,
                    start_date: row.start_date!,
                    end_date: row.end_date!,
                  }),
                ),
              })
            : await fetch(`${base}/${eventId(row.request_id)}`, { method: "DELETE", headers });
        outcome = classify(row.action, res.status);
        if (outcome !== "done") detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        else await res.body?.cancel();
      } catch (e) {
        outcome = classify(row.action, 0);
        detail = e instanceof Error ? e.message : String(e);
      }
    }

    counts[outcome]++;
    await db.rpc("calendar_sync_finish", { p_id: row.id, p_outcome: outcome, p_error: detail });
  }

  return Response.json(counts);
});

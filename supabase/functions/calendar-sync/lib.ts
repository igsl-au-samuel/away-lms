// Pure helpers for the calendar-sync Edge Function. No Deno APIs, so vitest can import it.

export type SyncRow = {
  id: number;
  request_id: string;
  action: "create" | "delete";
  attempts: number;
  full_name: string | null;
  start_date: string | null;
  end_date: string | null;
};

/** `defer` is a systemic fault (no token): retry later without spending one of the row's attempts. */
export type Outcome = "done" | "retry" | "fail" | "defer";

/** Per-request ceiling. 10 rows x 8s + the token call stays inside the 3 minute row lock. */
export const FETCH_TIMEOUT_MS = 8000;

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3/calendars";

/** Google event ids allow base32hex, and hex is a subset: same request, same id. */
export function eventId(requestId: string): string {
  return requestId.replace(/-/g, "").toLowerCase();
}

function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** All-day event. Never the leave type, note or decision comment (access matrix row 19). */
export function buildEvent(row: {
  request_id: string;
  full_name: string;
  start_date: string;
  end_date: string;
}) {
  return {
    id: eventId(row.request_id),
    summary: `${row.full_name} — Away`,
    start: { date: row.start_date },
    end: { date: addOneDay(row.end_date) }, // Google's end date is exclusive
    transparency: "transparent",
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { lmsRequestId: row.request_id } },
  };
}

/** Google reports rate and quota limits as 403 with one of these reasons. */
const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
]);

function isRateLimited(body: string): boolean {
  try {
    const errors = (JSON.parse(body) as { error?: { errors?: { reason?: string }[] } }).error?.errors;
    return (errors ?? []).some((e) => RATE_LIMIT_REASONS.has(e.reason ?? ""));
  } catch {
    return false;
  }
}

/**
 * Map an HTTP status (0 = network error) to what the outbox should do. `body` is the error
 * response text, used to tell a rate-limit 403 (retry) from a permission 403 (fail).
 */
export function classify(action: "create" | "delete", status: number, body = ""): Outcome {
  if (status >= 200 && status < 300) return "done";
  if (action === "create" && status === 409) return "done";
  if (action === "delete" && (status === 404 || status === 410)) return "done";
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 403 && isRateLimited(body)) return "retry";
  return "fail";
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The PEM is stored on one line with literal \n escapes. */
export function normalisePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

async function importKey(pem: string): Promise<CryptoKey> {
  const body = normalisePem(pem)
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Signed RS256 JWT assertion for the service account. */
export async function signAssertion(
  email: string,
  pem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importKey(pem),
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Exchange the assertion for an access token. */
export async function serviceAccountToken(email: string, pem: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signAssertion(email, pem),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const token = ((await res.json()) as { access_token?: string }).access_token;
  if (!token) throw new Error("token exchange returned no access_token");
  return token;
}

export type Counts = Record<Outcome, number> & { finishErrors: number };

export type ProcessDeps = {
  calendarId: string;
  /** Resolves an access token; a rejection defers every row without spending an attempt. */
  getToken: () => Promise<string>;
  /** Reports an outcome for a claimed row. Resolves to an error message, or null on success. */
  finish: (row: SyncRow, outcome: Outcome, detail: string | null) => Promise<string | null>;
  fetch?: typeof fetch;
  log?: (message: string) => void;
};

/** Work one claimed batch against the Calendar API and report each row's outcome. */
export async function processRows(rows: SyncRow[], deps: ProcessDeps): Promise<Counts> {
  const send = deps.fetch ?? fetch;
  const log = deps.log ?? (() => {});
  const counts: Counts = { done: 0, retry: 0, fail: 0, defer: 0, finishErrors: 0 };
  if (rows.length === 0) return counts;

  let token: string | null = null;
  let tokenError = "";
  try {
    token = await deps.getToken();
  } catch (e) {
    tokenError = e instanceof Error ? e.message : String(e);
  }

  const base = `${API}/${encodeURIComponent(deps.calendarId)}/events`;

  for (const row of rows) {
    let outcome: Outcome;
    let detail: string | null = null;

    if (row.action === "create" && (row.full_name === null || row.start_date === null || row.end_date === null)) {
      outcome = "done"; // the request is gone or no longer approved; a delete row follows if it matters
    } else if (!token) {
      outcome = "defer";
      detail = tokenError;
    } else {
      try {
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
        const res =
          row.action === "create"
            ? await send(base, {
                method: "POST",
                headers,
                signal,
                body: JSON.stringify(
                  buildEvent({
                    request_id: row.request_id,
                    full_name: row.full_name!,
                    start_date: row.start_date!,
                    end_date: row.end_date!,
                  }),
                ),
              })
            : await send(`${base}/${eventId(row.request_id)}`, { method: "DELETE", headers, signal });
        const text = res.ok ? "" : await res.text();
        if (res.ok) await res.body?.cancel();
        outcome = classify(row.action, res.status, text);
        if (outcome !== "done") detail = `HTTP ${res.status}: ${text.slice(0, 300)}`;
      } catch (e) {
        outcome = classify(row.action, 0);
        detail = e instanceof Error ? e.message : String(e);
      }
    }

    counts[outcome]++;
    // A throwing finish must not strand the rest of the batch behind their 3 minute locks.
    const finishError = await deps.finish(row, outcome, detail).catch((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    );
    if (finishError) {
      counts.finishErrors++;
      log(`calendar_sync_finish failed for outbox row ${row.id}: ${finishError}`);
    }
  }

  return counts;
}

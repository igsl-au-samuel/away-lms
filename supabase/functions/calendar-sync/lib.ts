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

export type Outcome = "done" | "retry" | "fail";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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

/** Map an HTTP status (0 = network error) to what the outbox should do. */
export function classify(action: "create" | "delete", status: number): Outcome {
  if (status >= 200 && status < 300) return "done";
  if (action === "create" && status === 409) return "done";
  if (action === "delete" && (status === 404 || status === 410)) return "done";
  if (status === 0 || status === 429 || status >= 500) return "retry";
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
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

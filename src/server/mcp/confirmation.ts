/**
 * Write confirmations for the remote MCP server (spec Decision 4).
 *
 * A preview returns a token; the write tool must send it back unchanged. The token is bound to the
 * user, the tool and the arguments that matter, so a model can't confirm one thing and do another.
 * WebCrypto only: this runs on Cloudflare Workers.
 */

export type ConfirmationTool = "submit_leave" | "approve_request" | "decline_request";

/** Arguments covered by the signature. Notes and comments are free text and are not bound. */
const BOUND_FIELDS: Record<ConfirmationTool, readonly string[]> = {
  submit_leave: ["end_date", "leave_type_id", "start_date"],
  approve_request: ["outcome", "request_id"],
  decline_request: ["outcome", "request_id"],
};

const TTL_MS = 10 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

export type ConfirmationClaim = { sub: string; tool: ConfirmationTool; args: Record<string, unknown> };

export type ConfirmationFailure = "missing" | "malformed" | "bad_signature" | "expired" | "wrong_user" | "wrong_tool" | "wrong_args";

export type ConfirmationResult = { ok: true } | { ok: false; reason: ConfirmationFailure };

type Payload = { sub: string; tool: ConfirmationTool; args: Record<string, string>; exp: number };

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Null when the text isn't valid base64url. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`Confirmation secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** The bound fields only, with sorted keys. Null if any is missing or not a string. */
function canonicalArgs(tool: ConfirmationTool, args: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const field of BOUND_FIELDS[tool]) {
    const value = args[field];
    if (typeof value !== "string" || value === "") return null;
    out[field] = value;
  }
  return out;
}

function isTool(value: unknown): value is ConfirmationTool {
  return typeof value === "string" && Object.hasOwn(BOUND_FIELDS, value);
}

/** Returns `base64url(payload).base64url(hmac)`. Throws on a short secret or a missing bound argument. */
export async function signConfirmation(claim: ConfirmationClaim, secret: string, now: number = Date.now()): Promise<string> {
  const key = await hmacKey(secret, "sign");
  const args = canonicalArgs(claim.tool, claim.args);
  if (!args) throw new Error(`Missing argument to bind for ${claim.tool}.`);
  const payload: Payload = { sub: claim.sub, tool: claim.tool, args, exp: now + TTL_MS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

/** Checks a token against the call being made. Throws only on a short secret. */
export async function verifyConfirmation(
  token: string | null | undefined,
  claim: ConfirmationClaim,
  secret: string,
  now: number = Date.now(),
): Promise<ConfirmationResult> {
  const key = await hmacKey(secret, "verify");
  if (!token) return { ok: false, reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, signatureText] = parts;
  const signature = fromBase64Url(signatureText);
  const bodyBytes = fromBase64Url(body);
  if (!signature || !bodyBytes) return { ok: false, reason: "malformed" };

  // crypto.subtle.verify compares in constant time.
  if (!(await crypto.subtle.verify("HMAC", key, signature, encoder.encode(body)))) return { ok: false, reason: "bad_signature" };

  let payload: Partial<Payload> | null;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !isTool(payload.tool) ||
    typeof payload.exp !== "number" ||
    !payload.args ||
    typeof payload.args !== "object"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (now > payload.exp) return { ok: false, reason: "expired" };
  if (payload.sub !== claim.sub) return { ok: false, reason: "wrong_user" };
  if (payload.tool !== claim.tool) return { ok: false, reason: "wrong_tool" };

  const wanted = canonicalArgs(claim.tool, claim.args);
  const signed = canonicalArgs(payload.tool, payload.args);
  if (!wanted || !signed || JSON.stringify(wanted) !== JSON.stringify(signed)) return { ok: false, reason: "wrong_args" };

  return { ok: true };
}

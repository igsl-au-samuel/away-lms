/**
 * Bearer-token checks for the remote MCP endpoint (spec Decision 2, ADR 0015).
 *
 * Claude chat sends a Supabase OAuth access token. We accept it only if, in this order: it is a
 * bearer token, Supabase vouches for its signature and expiry, it was issued by our project, its
 * audience is `authenticated`, and it was issued to an allowlisted OAuth client. Web-session
 * tokens have no `client_id`, so they never pass, and neither do tokens for any other client.
 *
 * Every refusal is the same 401: the body never says which check failed. Nothing here logs, and
 * the token must never be logged by callers either.
 */
import type { JwtPayload } from "@supabase/supabase-js";

/** Same shape as `db.auth.getClaims`, so the route can pass `(t) => db.auth.getClaims(t)`. */
export type GetClaims = (token: string) => Promise<{ data: { claims: JwtPayload } | null; error: unknown }>;

export type AuthClaims = JwtPayload & { sub: string; client_id: string };

export type AuthOk = { ok: true; token: string; claims: AuthClaims };

export type AuthOptions = {
  /** Project URL, e.g. https://xyz.supabase.co. Tokens must carry `iss` = `<supabaseUrl>/auth/v1`. */
  supabaseUrl: string;
  /** OAuth client ids allowed to call /mcp. Empty means nobody. */
  allowedClientIds: readonly string[];
  getClaims: GetClaims;
};

const AUDIENCE = "authenticated";
const BEARER = /^Bearer ([^\s]+)$/i;
const BODY = JSON.stringify({ error: "invalid_token", error_description: "Sign in to Away again." });

/** `MCP_ALLOWED_CLIENT_IDS` is comma-separated. Unset or blank gives an empty list, which rejects everything. */
export function parseAllowedClientIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/** The one 401 for every cause. It points the client at our protected-resource metadata. */
export function unauthorized(request: Request): Response {
  const metadata = `${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp`;
  return new Response(BODY, {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${metadata}"` },
  });
}

async function verifiedClaims(token: string, getClaims: GetClaims): Promise<JwtPayload | null> {
  try {
    const { data, error } = await getClaims(token);
    return error || !data ? null : data.claims;
  } catch {
    return null;
  }
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value !== "";

export async function authenticate(request: Request, options: AuthOptions): Promise<AuthOk | Response> {
  const token = BEARER.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return unauthorized(request);

  const claims = await verifiedClaims(token, options.getClaims);
  if (!claims) return unauthorized(request);

  if (claims.iss !== `${options.supabaseUrl.replace(/\/+$/, "")}/auth/v1`) return unauthorized(request);
  if (claims.aud !== AUDIENCE) return unauthorized(request);

  const clientId: unknown = claims.client_id;
  if (!nonEmpty(clientId) || !options.allowedClientIds.includes(clientId)) return unauthorized(request);
  if (!nonEmpty(claims.sub)) return unauthorized(request);

  return { ok: true, token, claims: { ...claims, sub: claims.sub, client_id: clientId } };
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { isLocalSupabaseUrl } from "../../scripts/lib/local-guard";

export type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!isLocalSupabaseUrl(url)) {
  throw new Error(`Integration tests refuse to run against ${url ?? "(no URL)"}: not a local Supabase URL.`);
}
if (!publishableKey || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set (see `supabase status`).");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Anonymous client (publishable key, no session). */
export function anonClient(): Db {
  return createClient<Database>(url!, publishableKey!, options);
}

/** Service-role client. Bypasses RLS: use for set-up and clean-up only. */
export function secretClient(): Db {
  return createClient<Database>(url!, secretKey!, options);
}

/** Client signed in as the given user. Throws if sign-in fails. */
export async function signedInClient(email: string, password: string): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export type TestUser = { id: string; email: string; password: string };

const created: string[] = [];

/** Creates a confirmed auth user plus profile. Removed by `cleanupUsers()`. */
export async function createTestUser(
  role: Database["public"]["Enums"]["app_role"] = "employee",
  password = `Pw-${randomUUID()}`,
): Promise<TestUser> {
  const admin = secretClient();
  const email = `it-${randomUUID().slice(0, 8)}@away.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: `Test ${role}`,
    role,
    region_code: "QLD",
    timezone: "Australia/Brisbane",
  });
  if (profileError) throw profileError;
  return { id: data.user.id, email, password };
}

/** Tracks a user created outside `createTestUser` (e.g. by inviteUser) for clean-up. */
export function trackUser(id: string) {
  created.push(id);
}

/** Deletes every tracked user; profiles go with them (FK cascade). Ignores already-deleted users. */
export async function cleanupUsers() {
  const admin = secretClient();
  while (created.length) {
    const id = created.pop()!;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

/** Claude's connector callback (spec, "Checks done"). */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

const oauthClients: string[] = [];

/** Registers a public OAuth client (PKCE, no secret) like the one Sam registers. Removed by `cleanupOAuthClients()`. */
export async function createOAuthClient(name = `it-client-${randomUUID().slice(0, 8)}`): Promise<{ clientId: string }> {
  const { data, error } = await secretClient().auth.admin.oauth.createClient({
    client_name: name,
    redirect_uris: [CLAUDE_CALLBACK],
    token_endpoint_auth_method: "none",
  });
  if (error) throw error;
  if (data.client_type !== "public") throw new Error(`Expected a public OAuth client, got ${data.client_type}.`);
  oauthClients.push(data.client_id);
  return { clientId: data.client_id };
}

export async function cleanupOAuthClients() {
  const admin = secretClient();
  while (oauthClients.length) await admin.auth.admin.oauth.deleteClient(oauthClients.pop()!);
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** Auth's error text for a failed step. Never includes a token. */
async function oauthStepError(step: string, res: Response): Promise<Error> {
  const body = (await res.text()).slice(0, 300);
  return new Error(`OAuth ${step} failed: HTTP ${res.status} ${body}`);
}

/**
 * Runs the OAuth 2.1 authorization-code flow with PKCE against local Supabase, without a browser,
 * and returns the user's access token for that client. Consent is given through the same
 * `auth.oauth` API the consent page uses, signed in as the user. Like Claude, the authorize and
 * token calls send no apikey.
 */
export async function oauthTokenFor(user: TestUser, clientId: string): Promise<string> {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authorize = new URL(`${url}/auth/v1/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  const authRes = await fetch(authorize, { redirect: "manual" });
  const consentUrl = authRes.headers.get("Location");
  if (authRes.status < 300 || authRes.status >= 400 || !consentUrl) throw await oauthStepError("authorize", authRes);
  const authorizationId = new URL(consentUrl).searchParams.get("authorization_id");
  if (!authorizationId) throw new Error(`OAuth authorize redirected without an authorization_id: ${new URL(consentUrl).pathname}`);

  const db = await signedInClient(user.email, user.password);
  const details = await db.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) throw details.error;
  let redirectUrl: string;
  if ("redirect_url" in details.data && !("authorization_id" in details.data)) {
    redirectUrl = details.data.redirect_url; // already consented
  } else {
    const approved = await db.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (approved.error) throw approved.error;
    redirectUrl = approved.data.redirect_url;
  }
  await db.auth.signOut({ scope: "local" });

  const callback = new URL(redirectUrl);
  if (callback.searchParams.get("state") !== state) throw new Error("OAuth state did not round-trip.");
  const code = callback.searchParams.get("code");
  if (!code) throw new Error(`OAuth callback had no code (error: ${callback.searchParams.get("error") ?? "none"}).`);

  const tokenRes = await fetch(`${url}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CLAUDE_CALLBACK,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw await oauthStepError("token", tokenRes);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new Error("OAuth token response had no access_token.");
  return accessToken;
}

import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { authenticate, parseAllowedClientIds, type GetClaims } from "../../src/server/mcp/auth";

const SUPABASE_URL = "https://project.supabase.co";
const ISS = `${SUPABASE_URL}/auth/v1`;
const CLIENT_ID = "9b1c5f9e-0000-4000-8000-000000000001";
const OTHER_CLIENT_ID = "9b1c5f9e-0000-4000-8000-000000000002";
const SUB = "11111111-1111-4111-8111-111111111111";
const KID = "test-key-1";
const MCP_URL = "https://away.example/mcp";
const WWW_AUTHENTICATE = 'Bearer resource_metadata="https://away.example/.well-known/oauth-protected-resource/mcp"';

const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = (value: unknown) => b64url(enc.encode(JSON.stringify(value)));

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: JsonWebKey[] };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(ES256, true, ["sign", "verify"]);
  signingKey = pair.privateKey;
  otherKey = (await crypto.subtle.generateKey(ES256, true, ["sign", "verify"])).privateKey;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, alg: "ES256", use: "sig" } as JsonWebKey] };
});

afterEach(() => vi.restoreAllMocks());

const now = () => Math.floor(Date.now() / 1000);

/** Claims shaped like a Supabase OAuth access token. */
function oauthClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISS,
    sub: SUB,
    aud: "authenticated",
    role: "authenticated",
    exp: now() + 3600,
    iat: now(),
    email: "emp@away.test",
    session_id: "s-1",
    client_id: CLIENT_ID,
    ...overrides,
  };
}

/** ES256 JWT. WebCrypto's ECDSA signature is already JWS r||s. */
async function sign(claims: Record<string, unknown>, key = signingKey, kid = KID): Promise<string> {
  const input = `${b64json({ alg: "ES256", typ: "JWT", kid })}.${b64json(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input)));
  return `${input}.${b64url(sig)}`;
}

/** Real supabase-js getClaims against the local JWKS. Any network call fails the test. */
function realGetClaims(): GetClaims {
  const failIfCalled = vi.fn(async () => {
    throw new Error("getClaims made a network call");
  });
  const db = createClient(SUPABASE_URL, "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: failIfCalled },
  });
  return (token) => db.auth.getClaims(token, { jwks: jwks as never });
}

const request = (authorization?: string) =>
  new Request(MCP_URL, { method: "POST", headers: authorization === undefined ? {} : { Authorization: authorization } });

const run = (authorization?: string, opts: { allowedClientIds?: string[]; getClaims?: GetClaims; supabaseUrl?: string } = {}) =>
  authenticate(request(authorization), {
    supabaseUrl: opts.supabaseUrl ?? SUPABASE_URL,
    allowedClientIds: opts.allowedClientIds ?? [CLIENT_ID],
    getClaims: opts.getClaims ?? realGetClaims(),
  });

let referenceBody: string | undefined;

async function expectUnauthorized(result: Awaited<ReturnType<typeof authenticate>>) {
  expect(result).toBeInstanceOf(Response);
  const response = result as Response;
  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toBe(WWW_AUTHENTICATE);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  const body = await response.text();
  referenceBody ??= body;
  expect(body).toBe(referenceBody);
}

describe("authenticate: refusals (all give the identical 401)", () => {
  it("no Authorization header", async () => {
    await expectUnauthorized(await run(undefined));
  });

  it("a scheme other than Bearer", async () => {
    await expectUnauthorized(await run(`Basic ${btoa("user:pass")}`));
  });

  it("Bearer with no token", async () => {
    await expectUnauthorized(await run("Bearer"));
    await expectUnauthorized(await run("Bearer "));
  });

  it("malformed tokens", async () => {
    await expectUnauthorized(await run("Bearer abc"));
    await expectUnauthorized(await run("Bearer a.b.c"));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims())} extra`));
  });

  it("a bad signature (same kid, different key)", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims(), otherKey)}`));
  });

  it("a tampered payload", async () => {
    const [header, , sig] = (await sign(oauthClaims())).split(".");
    await expectUnauthorized(await run(`Bearer ${header}.${b64json(oauthClaims({ sub: "someone-else" }))}.${sig}`));
  });

  it("an expired token", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ exp: now() - 1 }))}`));
  });

  it("a token with no exp", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ exp: undefined }))}`));
  });

  it("the wrong issuer", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ iss: "https://other.supabase.co/auth/v1" }))}`));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ iss: SUPABASE_URL }))}`));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ iss: undefined }))}`));
  });

  it("an audience other than authenticated", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ aud: "anon" }))}`));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ aud: ["authenticated", "other"] }))}`));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ aud: undefined }))}`));
  });

  it("no client_id (a web-session token)", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ client_id: undefined }))}`));
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ client_id: "" }))}`));
  });

  it("a client_id that isn't on the allowlist", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ client_id: OTHER_CLIENT_ID }))}`));
  });

  it("an empty allowlist rejects an otherwise valid token", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims())}`, { allowedClientIds: [] }));
  });

  it("no sub", async () => {
    await expectUnauthorized(await run(`Bearer ${await sign(oauthClaims({ sub: undefined }))}`));
  });

  it("a getClaims that throws or returns nothing", async () => {
    const token = await sign(oauthClaims());
    await expectUnauthorized(await run(`Bearer ${token}`, { getClaims: async () => { throw new Error("network down"); } }));
    await expectUnauthorized(await run(`Bearer ${token}`, { getClaims: async () => ({ data: null, error: null }) }));
  });

  it("never calls getClaims without a bearer token", async () => {
    const getClaims = vi.fn<GetClaims>();
    await expectUnauthorized(await run(undefined, { getClaims }));
    await expectUnauthorized(await run("Basic abc", { getClaims }));
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("the 401 body names no cause", () => {
    expect(referenceBody).toBeDefined();
    expect(JSON.parse(referenceBody!)).toEqual({ error: "invalid_token", error_description: "Sign in to Away again." });
  });
});

describe("authenticate: a valid token", () => {
  it("passes and returns the token and claims", async () => {
    const token = await sign(oauthClaims());
    const result = await run(`Bearer ${token}`);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.ok).toBe(true);
    expect(result.token).toBe(token);
    expect(result.claims.sub).toBe(SUB);
    expect(result.claims.client_id).toBe(CLIENT_ID);
  });

  it("accepts a lower-case scheme and a trailing slash on the Supabase URL", async () => {
    const result = await run(`bearer ${await sign(oauthClaims())}`, { supabaseUrl: `${SUPABASE_URL}/` });
    expect(result).not.toBeInstanceOf(Response);
  });

  it("accepts any client on a list of several", async () => {
    const result = await run(`Bearer ${await sign(oauthClaims({ client_id: OTHER_CLIENT_ID }))}`, {
      allowedClientIds: [CLIENT_ID, OTHER_CLIENT_ID],
    });
    expect(result).not.toBeInstanceOf(Response);
  });

  it("never logs the token", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const good = await sign(oauthClaims());
    const bad = await sign(oauthClaims({ client_id: OTHER_CLIENT_ID }));
    await run(`Bearer ${good}`);
    await run(`Bearer ${bad}`);
    await run(`Bearer ${good}`, { getClaims: async () => { throw new Error("boom"); } });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("parseAllowedClientIds", () => {
  it("treats unset or blank as an empty list", () => {
    expect(parseAllowedClientIds(undefined)).toEqual([]);
    expect(parseAllowedClientIds("")).toEqual([]);
    expect(parseAllowedClientIds(" , ,")).toEqual([]);
  });

  it("splits on commas and trims", () => {
    expect(parseAllowedClientIds("a, b,,c ")).toEqual(["a", "b", "c"]);
  });
});

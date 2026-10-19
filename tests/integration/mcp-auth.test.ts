import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "../../src/server/mcp/auth";
import {
  anonClient,
  cleanupOAuthClients,
  cleanupUsers,
  createOAuthClient,
  createTestUser,
  oauthTokenFor,
  signedInClient,
  type TestUser,
} from "./helpers";

// #240: real tokens from the local OAuth server through the /mcp bearer checks.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const verifier = anonClient();

let employee: TestUser;
let allowed: string;
let other: string;

const check = (token: string) =>
  authenticate(new Request("http://127.0.0.1:3000/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}` } }), {
    supabaseUrl,
    allowedClientIds: [allowed],
    getClaims: (t) => verifier.auth.getClaims(t),
  });

async function expect401(result: Awaited<ReturnType<typeof authenticate>>) {
  expect(result).toBeInstanceOf(Response);
  expect((result as Response).status).toBe(401);
  expect((result as Response).headers.get("WWW-Authenticate")).toBe(
    'Bearer resource_metadata="http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp"',
  );
}

beforeAll(async () => {
  employee = await createTestUser("employee");
  allowed = (await createOAuthClient()).clientId;
  other = (await createOAuthClient()).clientId;
});

afterAll(async () => {
  await cleanupOAuthClients();
  await cleanupUsers();
});

describe("authenticate with real local tokens", () => {
  it("accepts an OAuth token issued to the allowlisted client", async () => {
    const result = await check(await oauthTokenFor(employee, allowed));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.claims.sub).toBe(employee.id);
    expect(result.claims.client_id).toBe(allowed);
  });

  it("refuses a web-session token (no client_id)", async () => {
    const db = await signedInClient(employee.email, employee.password);
    const { data } = await db.auth.getSession();
    await expect401(await check(data.session!.access_token));
  });

  it("refuses a token issued to another registered client", async () => {
    await expect401(await check(await oauthTokenFor(employee, other)));
  });

  it("refuses an allowlisted token whose signature was tampered with", async () => {
    const token = await oauthTokenFor(employee, allowed);
    const [header, payload, sig] = token.split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    await expect401(await check(`${header}.${payload}.${flipped}`));
  });
});

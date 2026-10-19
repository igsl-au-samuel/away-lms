import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMcpPost, type McpEnv } from "../../src/server/mcp/handler";
import { cleanupOAuthClients, cleanupUsers, createOAuthClient, createTestUser, oauthTokenFor, signedInClient, TEST_PASSWORD, type TestUser } from "./helpers";

// #242: real local tokens through the /mcp handler (initialize, tools/list).

let employee: TestUser;
let env: McpEnv;

const rpc = (token: string | null, body: unknown) =>
  handleMcpPost(
    new Request("http://127.0.0.1:3000/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
    env,
    { log: () => {} },
  );

beforeAll(async () => {
  employee = await createTestUser("employee");
  const { clientId } = await createOAuthClient();
  env = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    allowedClientIds: [clientId],
    confirmSecret: "integration-test-secret-0123456789abcdef",
  };
});

afterAll(async () => {
  await cleanupOAuthClients();
  await cleanupUsers();
});

describe("POST /mcp", () => {
  it("401s without a token", async () => {
    const res = await rpc(null, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("401s for a web-session token", async () => {
    const web = await signedInClient(employee.email, employee.password || TEST_PASSWORD);
    const { data } = await web.auth.getSession();
    const res = await rpc(data.session!.access_token, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("serves initialize and tools/list for an OAuth token", async () => {
    const token = await oauthTokenFor(employee, env.allowedClientIds[0]);
    const init = await rpc(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "it", version: "0" } },
    });
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("away-lms");

    const list = await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.status).toBe(200);
    const { result } = await list.json();
    expect(result.tools).toHaveLength(10);
  });
});

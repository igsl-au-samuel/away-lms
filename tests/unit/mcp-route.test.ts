import { describe, expect, it, vi } from "vitest";
import { GET as metadataGet } from "../../src/app/.well-known/oauth-protected-resource/route";
import { GET as metadataMcpGet } from "../../src/app/.well-known/oauth-protected-resource/mcp/route";
import { DELETE, GET } from "../../src/app/mcp/route";
import { config } from "../../src/proxy";
import { handleMcpPost, type McpEnv } from "../../src/server/mcp/handler";
import type { Db } from "../../src/server/mcp/session";

const env: McpEnv = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: "sb_publishable_test",
  allowedClientIds: ["client-1"],
  confirmSecret: "x".repeat(32),
};

const post = (headers: Record<string, string> = {}, body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" }) =>
  new Request("https://away.example/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });

describe("/mcp methods", () => {
  it("answers GET and DELETE with 405 and Allow: POST", () => {
    for (const handler of [GET, DELETE]) {
      const res = handler();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    }
  });
});

describe("/mcp authentication order", () => {
  const forbidden = vi.fn(() => {
    throw new Error("Supabase must not be used");
  });

  it("returns 401 with no Supabase call when there is no token", async () => {
    const res = await handleMcpPost(post(), env, { makeClient: forbidden as never });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("/.well-known/oauth-protected-resource/mcp");
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("returns the same 401 when verification fails", async () => {
    const noToken = await handleMcpPost(post(), env, { makeClient: forbidden as never });
    const makeClient = () =>
      ({ auth: { getClaims: async () => ({ data: null, error: new Error("bad signature") }) } }) as unknown as Db;
    const res = await handleMcpPost(post({ Authorization: "Bearer not-a-jwt" }), env, { makeClient });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(await noToken.text());
  });

  it("refuses to run with a secret key as the publishable key", async () => {
    const res = await handleMcpPost(post(), { ...env, publishableKey: "sb_secret_abc" }, { makeClient: forbidden as never });
    expect(res.status).toBe(500);
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe("/mcp logging", () => {
  it("logs user, tool, outcome and duration only", async () => {
    const token = "secret-token-value";
    const claims = { iss: "https://project.supabase.co/auth/v1", aud: "authenticated", sub: "user-1", client_id: "client-1" };
    const rpc = async () => ({ data: null, error: { message: "Postgres says: private note text" } });
    const makeClient = () => ({ auth: { getClaims: async () => ({ data: { claims }, error: null }) }, rpc }) as unknown as Db;
    const lines: string[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation((...args) => void lines.push(args.join(" ")));
    const res = await handleMcpPost(
      post(
        { Authorization: `Bearer ${token}` },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: { note: "private note text" } } },
      ),
      env,
      { makeClient, log: (l) => void lines.push(l) },
    );
    errors.mockRestore();
    expect(res.status).toBe(200);
    const all = lines.join("\n");
    expect(all).toContain("user=user-1 tool=whoami outcome=error");
    expect(all).not.toContain(token);
    expect(all).not.toContain("private note text");
    expect(await res.text()).not.toContain("Postgres says");
  });
});

describe("protected-resource metadata", () => {
  it("names the resource and the Supabase auth server on both paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    for (const get of [metadataGet, metadataMcpGet]) {
      const res = get(new Request("https://away.example/.well-known/oauth-protected-resource"));
      expect(await res.json()).toEqual({
        resource: "https://away.example/mcp",
        authorization_servers: ["https://project.supabase.co/auth/v1"],
        bearer_methods_supported: ["header"],
      });
      expect(res.headers.get("Cache-Control")).toContain("max-age");
    }
    vi.unstubAllEnvs();
  });
});

describe("proxy matcher", () => {
  const re = new RegExp(`^${config.matcher[0]}$`);
  it("skips /mcp and /.well-known", () => {
    for (const path of ["/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      expect(re.test(path), path).toBe(false);
    }
  });
  it("still covers app pages", () => {
    for (const path of ["/", "/requests", "/mcpish", "/oauth/consent"]) expect(re.test(path), path).toBe(true);
  });
});

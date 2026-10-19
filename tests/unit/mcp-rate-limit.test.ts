import { describe, expect, it, vi } from "vitest";
import { handleMcpPost, type McpEnv } from "../../src/server/mcp/handler";
import { LIMIT, limiter, type RateLimitBinding } from "../../src/server/mcp/rate-limit";
import type { Db } from "../../src/server/mcp/session";

/** A stand-in for the Workers binding: counts per key, like a fixed window that never resets. */
function fakeBinding(): RateLimitBinding {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= LIMIT };
    },
  };
}

describe.each([
  ["Workers binding", () => limiter(fakeBinding())],
  ["in-memory fallback", () => limiter(undefined)],
])("limiter (%s)", (_name, make) => {
  it("refuses the 61st call in the window", async () => {
    const check = make();
    for (let i = 0; i < LIMIT; i++) expect(await check("ip:1.1.1.1")).toBe(true);
    expect(await check("ip:1.1.1.1")).toBe(false);
  });

  it("does not affect another key", async () => {
    const check = make();
    for (let i = 0; i <= LIMIT; i++) await check("ip:1.1.1.1");
    expect(await check("ip:2.2.2.2")).toBe(true);
  });
});

describe("in-memory window", () => {
  it("resets after the period", async () => {
    let now = 1_000_000;
    const check = limiter(undefined, { now: () => now });
    for (let i = 0; i <= LIMIT; i++) await check("sub:u");
    expect(await check("sub:u")).toBe(false);
    now += 60_000;
    expect(await check("sub:u")).toBe(true);
  });

  it("falls back when the binding is undefined", async () => {
    const check = limiter(undefined);
    expect(await check("k")).toBe(true);
  });
});

describe("/mcp rate limiting", () => {
  const env: McpEnv = {
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
    allowedClientIds: ["client-1"],
    confirmSecret: "x".repeat(32),
  };
  const claims = { iss: "https://project.supabase.co/auth/v1", aud: "authenticated", sub: "user-1", client_id: "client-1" };
  const post = (headers: Record<string, string> = {}) =>
    new Request("https://away.example/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

  it("checks the IP before verifying the token, and answers 429 with Retry-After", async () => {
    const makeClient = vi.fn();
    const rateLimit = vi.fn(async () => false);
    const res = await handleMcpPost(post({ Authorization: "Bearer t", "CF-Connecting-IP": "9.9.9.9" }), env, {
      makeClient: makeClient as never,
      rateLimit,
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({ error: "rate_limited", error_description: "Too many requests. Try again shortly." });
    expect(rateLimit).toHaveBeenCalledWith("ip:9.9.9.9");
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("checks the user after verification", async () => {
    const makeClient = () => ({ auth: { getClaims: async () => ({ data: { claims }, error: null }) } }) as unknown as Db;
    const keys: string[] = [];
    const rateLimit = async (key: string) => {
      keys.push(key);
      return !key.startsWith("sub:");
    };
    const res = await handleMcpPost(post({ Authorization: "Bearer t", "CF-Connecting-IP": "9.9.9.9" }), env, {
      makeClient,
      rateLimit,
    });
    expect(keys).toEqual(["ip:9.9.9.9", "sub:user-1"]);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});

import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../src/lib/database.types";
import { handleMcpPost, type McpEnv } from "../../src/server/mcp/handler";
import { LIMIT, limiter } from "../../src/server/mcp/rate-limit";
import {
  cleanupOAuthClients,
  cleanupUsers,
  createOAuthClient,
  createTestUser,
  oauthTokenFor,
  secretClient,
  signedInClient,
  type TestUser,
} from "./helpers";

// #244: the remote server can only do what the person can do. Real OAuth tokens through the /mcp
// handler, against local Supabase. Refusals first (access matrix rows 13-20), then happy paths.

type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let env: McpEnv;
let clientId: string;
let employee: TestUser;
let employee2: TestUser;
let manager: TestUser;
let manager2: TestUser;
let admin: TestUser;
const tokens = new Map<string, string>();

/** Table reads and RPCs made through clients the handler built, so a refusal can prove it read nothing. */
let dbCalls = 0;
const makeClient = (u: string, key: string, token: string) => {
  const client = createClient<Database>(u, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const method of ["from", "rpc"] as const) {
    const original = client[method].bind(client) as (...a: unknown[]) => unknown;
    (client as unknown as Record<string, unknown>)[method] = (...a: unknown[]) => {
      dbCalls += 1;
      return original(...a);
    };
  }
  return client;
};

const post = (token: string | null, body: unknown, deps: Parameters<typeof handleMcpPost>[2] = {}, headers: Record<string, string> = {}) =>
  handleMcpPost(
    new Request("http://127.0.0.1:3000/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
    { log: () => {}, makeClient, ...deps },
  );

const callBody = (name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name, arguments: args },
});

async function tool(token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await post(token, callBody(name, args));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result?: ToolResult; error?: { message: string } };
  if (!body.result) throw new Error(`JSON-RPC error for ${name}: ${body.error?.message}`);
  return body.result;
}

const as = (u: TestUser) => {
  const token = tokens.get(u.id);
  if (!token) throw new Error("no token for user");
  return (name: string, args?: Record<string, unknown>) => tool(token, name, args);
};

const text = (r: ToolResult) => r.content.map((c) => c.text).join("\n");
const confirmationOf = (r: ToolResult) => r.structuredContent?.confirmation as string;

async function expectNoRequests(user: TestUser, startDate?: string) {
  let query = secretClient().from("leave_requests").select("id").eq("user_id", user.id);
  if (startDate) query = query.eq("start_date", startDate);
  expect((await query).data).toEqual([]);
}

async function statusOf(id: string) {
  const { data } = await secretClient().from("leave_requests").select("status, decided_by").eq("id", id).single();
  return data;
}

/** Submits through the full preview + confirm path and returns the new request id. */
async function submitFor(user: TestUser, day: string): Promise<string> {
  const call = as(user);
  const range = { leave_type: "Annual", start_date: day, end_date: day };
  const preview = await call("preview_leave", range);
  const res = await call("submit_leave", { ...range, confirmation: confirmationOf(preview) });
  expect(res.isError).toBeFalsy();
  return (res.structuredContent!.request as { id: string }).id;
}

async function previewDecision(approver: TestUser, id: string, outcome: "approved" | "declined") {
  const res = await as(approver)("preview_decision", { request_id: id, outcome });
  expect(res.isError).toBeFalsy();
  return confirmationOf(res);
}

beforeAll(async () => {
  [employee, employee2, manager, manager2, admin] = await Promise.all([
    createTestUser("employee"),
    createTestUser("employee"),
    createTestUser("manager"),
    createTestUser("manager"),
    createTestUser("admin"),
  ]);
  clientId = (await createOAuthClient()).clientId;
  env = {
    supabaseUrl: url,
    publishableKey,
    allowedClientIds: [clientId],
    confirmSecret: "integration-test-secret-0123456789abcdef",
  };
  for (const u of [employee, employee2, manager, manager2, admin]) tokens.set(u.id, await oauthTokenFor(u, clientId));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await cleanupOAuthClients();
  await cleanupUsers();
});

describe("refusals", () => {
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const metadata = 'Bearer resource_metadata="http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp"';

  // 1
  it("401s with the metadata header for no token, a malformed token and a web-session token, reading nothing", async () => {
    const web = await signedInClient(employee.email, employee.password);
    const webToken = (await web.auth.getSession()).data.session!.access_token;
    dbCalls = 0;
    for (const token of [null, "not-a-jwt", "a.b.c", webToken]) {
      const res = await post(token, callBody("list_my_requests"));
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe(metadata);
    }
    // The only client use is the throwaway one verifying a signature (auth.getClaims), never from/rpc.
    expect(dbCalls).toBe(0);
  });

  // 2
  it("401s for a token issued to another registered client", async () => {
    const { clientId: other } = await createOAuthClient();
    const token = await oauthTokenFor(employee, other);
    dbCalls = 0;
    const res = await post(token, list);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(metadata);
    expect(dbCalls).toBe(0);
  });

  // 3 (rows 13-17)
  it("refuses an employee list_pending, preview_decision and approve_request, and changes nothing", async () => {
    const id = await submitFor(employee2, "2026-12-01");
    const call = as(employee);

    const pending = await call("list_pending");
    expect(pending.isError).toBe(true);
    expect(text(pending)).toMatch(/\(not_allowed\)$/);

    // The queue is empty for an employee, so a preview can't find the request.
    const preview = await call("preview_decision", { request_id: id, outcome: "approved" });
    expect(preview.isError).toBe(true);
    expect(confirmationOf(preview)).toBeUndefined();

    // Even with a valid manager token for this request, an employee can't use it (wrong user).
    const managerToken = await previewDecision(manager, id, "approved");
    const approve = await call("approve_request", { request_id: id, confirmation: managerToken });
    expect(approve.isError).toBe(true);
    const bare = await call("approve_request", { request_id: id });
    expect(bare.isError).toBe(true);

    expect(await statusOf(id)).toEqual({ status: "pending", decided_by: null });
  });

  // 4 (rows 18, 19, 20)
  it("hides other people's leave types from an employee and returns only their own balance", async () => {
    await submitFor(manager, "2026-12-02");
    const own = await submitFor(employee, "2026-12-03");
    await as(manager)("approve_request", {
      request_id: own,
      confirmation: await previewDecision(manager, own, "approved"),
    });

    const cal = await as(employee)("team_calendar", { from: "2026-12-01", to: "2026-12-31" });
    const entries = cal.structuredContent!.entries as { user_id: string; leave_type_name: string | null }[];
    const others = entries.filter((e) => e.user_id !== employee.id);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((e) => e.leave_type_name === null)).toBe(true);
    expect(entries.find((e) => e.user_id === employee.id)?.leave_type_name).toBe("Annual");
    // A manager sees the types (row 19).
    const seen = await as(manager)("team_calendar", { from: "2026-12-01", to: "2026-12-31" });
    expect((seen.structuredContent!.entries as { leave_type_name: string | null }[]).every((e) => e.leave_type_name)).toBe(true);

    // Row 20: no tool takes a user id, and the database refuses the RPC for someone else's id.
    const balance = await as(employee)("get_balance", { year: 2026, user_id: manager.id });
    const annual = (balance.structuredContent!.balances as { name: string; pending: number; taken: number }[]).find((b) => b.name === "Annual")!;
    expect(annual.taken).toBe(1); // the employee's own approved day, not the manager's pending one
    expect(annual.pending).toBe(0);
    const db = makeClient(url, publishableKey, tokens.get(employee.id)!);
    const direct = await db.rpc("get_balances", { p_user_id: manager.id, p_year: 2026 });
    expect(direct.error).not.toBeNull();
  });

  // 5 (rows 14, 15)
  it("stops a manager approving their own request or another manager's", async () => {
    const own = await submitFor(manager, "2026-12-07");
    const theirs = await submitFor(manager2, "2026-12-08");

    // Previews come from the approval queue, so they don't find these requests at all.
    for (const id of [own, theirs]) {
      const preview = await as(manager)("preview_decision", { request_id: id, outcome: "approved" });
      expect(preview.isError).toBe(true);
    }
    // A token minted for an allowed request doesn't help: the database still decides.
    const employeeRequest = await submitFor(employee, "2026-12-09");
    for (const id of [own, theirs]) {
      const forged = await previewDecision(manager, employeeRequest, "approved");
      const res = await as(manager)("approve_request", { request_id: id, confirmation: forged });
      expect(res.isError).toBe(true);
    }
    expect((await statusOf(own))?.status).toBe("pending");
    expect((await statusOf(theirs))?.status).toBe("pending");
  });

  // 6
  it("refuses every tool for a deactivated user whose token still passes the JWT check", async () => {
    const gone = await createTestUser("employee");
    const token = await oauthTokenFor(gone, clientId);
    expect((await tool(token, "whoami")).isError).toBeFalsy();
    await secretClient().from("profiles").update({ is_active: false }).eq("id", gone.id);

    const names = ["whoami", "get_balance", "list_my_requests", "team_calendar", "list_pending"];
    for (const name of names) {
      const res = await tool(token, name, name === "team_calendar" ? { from: "2026-12-01", to: "2026-12-07" } : {});
      expect(res.isError, name).toBe(true);
      expect(text(res), name).toMatch(/\(not_allowed\)$/);
    }
    const submit = await tool(token, "submit_leave", { leave_type: "Annual", start_date: "2026-12-10", end_date: "2026-12-10", confirmation: "x" });
    expect(submit.isError).toBe(true);
    await expectNoRequests(gone);
  });

  // 7
  describe("writes without a valid confirmation create or change nothing", () => {
    const range = { leave_type: "Annual", start_date: "2026-12-14", end_date: "2026-12-14" };

    it("submit_leave: none, stale, for other arguments, or minted for another user", async () => {
      const call = as(employee2);
      const none = await call("submit_leave", range);
      expect(text(none)).toMatch(/\(confirmation_required\)$/);

      const token = confirmationOf(await call("preview_leave", range));
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11 * 60 * 1000 });
      const stale = await call("submit_leave", { ...range, confirmation: token });
      vi.useRealTimers();
      expect(text(stale)).toMatch(/\(confirmation_required\)$/);

      const other = await call("submit_leave", { ...range, end_date: "2026-12-15", confirmation: token });
      expect(text(other)).toMatch(/\(confirmation_required\)$/);

      const forAnother = await as(employee)("submit_leave", { ...range, confirmation: token });
      expect(text(forAnother)).toMatch(/\(confirmation_required\)$/);

      await expectNoRequests(employee2, range.start_date);
      await expectNoRequests(employee, range.start_date);
    });

    it("approve_request and decline_request: none, stale, for another request, another outcome or another user", async () => {
      const id = await submitFor(employee, "2026-12-16");
      const spare = await submitFor(employee, "2026-12-17");
      const m = as(manager);
      const token = await previewDecision(manager, id, "approved");

      expect(text(await m("approve_request", { request_id: id }))).toMatch(/\(confirmation_required\)$/);
      expect(text(await m("approve_request", { request_id: spare, confirmation: token }))).toMatch(/\(confirmation_required\)$/);
      // An approve token can't decline, and an admin can't use the manager's token.
      expect(text(await m("decline_request", { request_id: id, reason: "No", confirmation: token }))).toMatch(/\(confirmation_required\)$/);
      expect(text(await as(admin)("approve_request", { request_id: id, confirmation: token }))).toMatch(/\(confirmation_required\)$/);

      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11 * 60 * 1000 });
      const stale = await m("approve_request", { request_id: id, confirmation: token });
      vi.useRealTimers();
      expect(text(stale)).toMatch(/\(confirmation_required\)$/);

      expect(await statusOf(id)).toEqual({ status: "pending", decided_by: null });
      expect(await statusOf(spare)).toEqual({ status: "pending", decided_by: null });
    });
  });

  // 8 (row 16)
  it("refuses a second decision on a decided request", async () => {
    const id = await submitFor(employee, "2026-12-18");
    const approved = await as(manager)("approve_request", { request_id: id, confirmation: await previewDecision(manager, id, "approved") });
    expect(approved.isError).toBeFalsy();

    // Preview can't find it any more; a fresh-looking token from before the decision is refused by the database.
    const again = await as(admin)("preview_decision", { request_id: id, outcome: "declined" });
    expect(again.isError).toBe(true);
    const decline = await as(manager)("decline_request", { request_id: id, reason: "Changed my mind", confirmation: "x" });
    expect(decline.isError).toBe(true);
    expect(await statusOf(id)).toEqual({ status: "approved", decided_by: manager.id });
  });

  // 9
  describe("rate limiting", () => {
    it("429s the 61st call from one IP, before any token work", async () => {
      const rateLimit = limiter(undefined);
      const headers = { "CF-Connecting-IP": "203.0.113.7" };
      for (let i = 0; i < LIMIT; i++) {
        expect((await post(null, callBody("whoami"), { rateLimit }, headers)).status).toBe(401);
      }
      dbCalls = 0;
      const res = await post(null, callBody("whoami"), { rateLimit }, headers);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
      expect(dbCalls).toBe(0);
      // A different address is unaffected.
      expect((await post(null, callBody("whoami"), { rateLimit }, { "CF-Connecting-IP": "203.0.113.8" })).status).toBe(401);
    });

    it("429s the 61st call from one user, whatever the IP", async () => {
      const rateLimit = limiter(undefined);
      const token = tokens.get(employee2.id)!;
      for (let i = 0; i < LIMIT; i++) {
        expect((await post(token, callBody("whoami"), { rateLimit })).status).toBe(200);
      }
      expect((await post(token, callBody("whoami"), { rateLimit })).status).toBe(429);
      // Another user has their own count.
      expect((await post(tokens.get(manager2.id)!, callBody("whoami"), { rateLimit })).status).toBe(200);
    });
  });
});

describe("happy paths", () => {
  it("an employee previews and submits; a manager previews and approves", async () => {
    const range = { leave_type: "Annual", start_date: "2026-12-21", end_date: "2026-12-22" };
    const e = as(employee2);
    const preview = await e("preview_leave", range);
    expect(preview.structuredContent).toMatchObject({ working_days: 2, errors: [] });
    const submitted = await e("submit_leave", { ...range, note: "Christmas", confirmation: confirmationOf(preview) });
    expect(submitted.structuredContent).toMatchObject({ request: { status: "pending", working_days: 2 } });
    const id = (submitted.structuredContent!.request as { id: string }).id;

    const m = as(manager);
    const queue = await m("list_pending");
    expect((queue.structuredContent!.pending as { id: string }[]).map((p) => p.id)).toContain(id);
    const token = await previewDecision(manager, id, "approved");
    const approved = await m("approve_request", { request_id: id, comment: "Enjoy", confirmation: token });
    expect(approved.structuredContent).toMatchObject({ request: { status: "approved", decided_by: manager.id } });
  });

  it("follows the DEMO.md sequence: balance, request, queue, approve, calendar", async () => {
    const e = as(employee);
    const before = await e("get_balance", { year: 2026 });
    const annualBefore = (before.structuredContent!.balances as { name: string; available: number }[]).find((b) => b.name === "Annual")!;

    const id = await submitFor(employee, "2026-12-23");

    const m = as(admin);
    expect(((await m("list_pending")).structuredContent!.pending as { id: string }[]).map((p) => p.id)).toContain(id);
    const approved = await m("approve_request", { request_id: id, confirmation: await previewDecision(admin, id, "approved") });
    expect(approved.isError).toBeFalsy();

    const after = await e("get_balance", { year: 2026 });
    const annualAfter = (after.structuredContent!.balances as { name: string; available: number }[]).find((b) => b.name === "Annual")!;
    expect(annualAfter.available).toBe(annualBefore.available - 1);

    const cal = await e("team_calendar", { from: "2026-12-21", to: "2026-12-27" });
    expect((cal.structuredContent!.entries as { user_id: string; status: string }[]).some((x) => x.user_id === employee.id && x.status === "approved")).toBe(true);
  });
});

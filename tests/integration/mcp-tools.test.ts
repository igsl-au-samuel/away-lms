import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionProvider } from "../../mcp/src/session";
import { loadViewer, type Session } from "../../src/server/mcp/session";
import { createLmsServer, type GetSession } from "../../src/server/mcp/tools";
import { cleanupUsers, createTestUser, signedInClient, type TestUser } from "./helpers";

type Call = (name: string, args?: Record<string, unknown>) => Promise<CallToolResult>;
const clients: Client[] = [];

/** An MCP client wired in memory to a server bound to the given session provider. */
async function connect(getSession: GetSession): Promise<Call> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createLmsServer(getSession).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  clients.push(client);
  return (name, args = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
}

async function connectAs(user: TestUser): Promise<Call> {
  const db = await signedInClient(user.email, user.password);
  const session: Session = { db, me: await loadViewer(db) };
  return connect(async () => session);
}

const text = (res: CallToolResult) => res.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
const data = <T>(res: CallToolResult) => res.structuredContent as T;

let employee: TestUser;
let manager: TestUser;
let asEmployee: Call;
let asManager: Call;

beforeAll(async () => {
  employee = await createTestUser("employee");
  manager = await createTestUser("manager");
  asEmployee = await connectAs(employee);
  asManager = await connectAs(manager);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await cleanupUsers();
});

describe("LMS MCP tools", () => {
  it("lists every tool, with write tools marked as not read-only", async () => {
    const client = clients[0];
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "approve_request",
      "decline_request",
      "get_balance",
      "list_my_requests",
      "list_pending",
      "preview_leave",
      "submit_leave",
      "team_calendar",
      "whoami",
    ]);
    const writes = tools.filter((t) => t.annotations?.readOnlyHint === false).map((t) => t.name);
    expect(writes.sort()).toEqual(["approve_request", "decline_request", "submit_leave"]);
  });

  it("whoami returns the signed-in user", async () => {
    const res = await asEmployee("whoami");
    expect(res.isError).toBeFalsy();
    expect(data<{ id: string; role: string }>(res)).toMatchObject({ id: employee.id, role: "employee" });
  });

  it("get_balance returns the year's balances", async () => {
    const res = await asEmployee("get_balance", { year: 2026 });
    expect(res.isError).toBeFalsy();
    const { balances } = data<{ balances: { name: string }[] }>(res);
    expect(balances.map((b) => b.name)).toContain("Annual");
    expect(text(res)).toMatch(/^Balances for 2026:/);
  });

  it("previews, submits, then lists the request; a repeat preview reports the overlap", async () => {
    const range = { leave_type: "annual", start_date: "2026-11-09", end_date: "2026-11-13" };

    const preview = await asEmployee("preview_leave", range);
    expect(preview.isError).toBeFalsy();
    expect(data(preview)).toMatchObject({ working_days: 5, errors: [] });

    const submitted = await asEmployee("submit_leave", { ...range, note: "Trip" });
    expect(submitted.isError).toBeFalsy();
    expect(data(submitted)).toMatchObject({ request: { status: "pending", working_days: 5, leave_type: "Annual" } });

    const listed = await asEmployee("list_my_requests", { status: "pending" });
    const { requests } = data<{ requests: { start_date: string; leave_type: string }[] }>(listed);
    expect(requests).toEqual([expect.objectContaining({ start_date: "2026-11-09", leave_type: "Annual" })]);

    const again = await asEmployee("preview_leave", range);
    expect(data(again)).toMatchObject({ errors: ["overlap"] });
    expect(text(again)).toMatch(/already have leave booked/);

    const dup = await asEmployee("submit_leave", range);
    expect(dup.isError).toBe(true);
    expect(text(dup)).toMatch(/\(overlap\)$/);
  });

  it("rejects an unknown leave type and lists the valid names", async () => {
    const res = await asEmployee("submit_leave", { leave_type: "Gardening", start_date: "2026-12-01", end_date: "2026-12-01" });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/No active leave type called "Gardening".*Annual/);
    // Clients that show structuredContent instead of text still get the hint.
    expect(data<{ message: string }>(res).message).toMatch(/Choose one of: .*Annual/);
  });

  it("preview_leave says a range over two leave years can't be counted, not 'null days'", async () => {
    const res = await asEmployee("preview_leave", { leave_type: "Annual", start_date: "2026-12-28", end_date: "2027-01-04" });
    expect(text(res)).toMatch(/can't be counted\. Problems: A request can't span two leave years/);
    expect(text(res)).not.toMatch(/null/);
  });

  it("rejects malformed dates before calling the database", async () => {
    const res = await asEmployee("preview_leave", { leave_type: "Annual", start_date: "next friday", end_date: "2026-12-01" });
    expect(res.isError).toBe(true);
  });

  it("a manager lists pending requests, approves one and declines another", async () => {
    const second = await asEmployee("submit_leave", { leave_type: "Annual", start_date: "2026-11-23", end_date: "2026-11-24" });
    const secondId = data<{ request: { id: string } }>(second).request.id;

    const pending = await asManager("list_pending");
    expect(pending.isError).toBeFalsy();
    const mine = data<{ pending: { id: string; user_id: string; start_date: string }[] }>(pending).pending.filter(
      (p) => p.user_id === employee.id,
    );
    expect(mine.map((p) => p.start_date)).toEqual(["2026-11-09", "2026-11-23"]);

    const approved = await asManager("approve_request", { request_id: mine[0].id, comment: "Enjoy" });
    expect(approved.isError).toBeFalsy();
    expect(data(approved)).toMatchObject({ request: { status: "approved", decided_by: manager.id } });

    const declined = await asManager("decline_request", { request_id: secondId, reason: "Release week" });
    expect(declined.isError).toBeFalsy();
    expect(data(declined)).toMatchObject({ request: { status: "declined", decision_comment: "Release week" } });

    const again = await asManager("approve_request", { request_id: secondId });
    expect(text(again)).toMatch(/\(already_decided\)$/);
  });

  it("decline_request needs a reason", async () => {
    const res = await asManager("decline_request", { request_id: crypto.randomUUID(), reason: "" });
    expect(res.isError).toBe(true);
  });

  it("an employee can't use the approver tools", async () => {
    const pending = await asEmployee("list_pending");
    expect(pending.isError).toBe(true);
    expect(text(pending)).toMatch(/\(not_allowed\)$/);

    const approve = await asEmployee("approve_request", { request_id: crypto.randomUUID() });
    expect(approve.isError).toBe(true);
  });

  it("a manager can't approve their own request", async () => {
    const own = await asManager("submit_leave", { leave_type: "Annual", start_date: "2026-11-16", end_date: "2026-11-16" });
    const ownId = data<{ request: { id: string } }>(own).request.id;
    const res = await asManager("approve_request", { request_id: ownId });
    expect(text(res)).toMatch(/\(own_request\)$/);
  });

  it("list_my_requests only returns the caller's own rows, even for a manager", async () => {
    const res = await asManager("list_my_requests");
    const { requests } = data<{ requests: { start_date: string }[] }>(res);
    expect(requests.map((r) => r.start_date)).toEqual(["2026-11-16"]);
  });

  it("team_calendar shows colleagues' leave but hides their leave type from an employee", async () => {
    const res = await asEmployee("team_calendar", { from: "2026-11-01", to: "2026-11-30" });
    expect(res.isError).toBeFalsy();
    const { entries } = data<{ entries: { user_id: string; leave_type_name: string | null; status: string }[] }>(res);
    const managers = entries.filter((e) => e.user_id === manager.id);
    expect(managers).toEqual([expect.objectContaining({ status: "pending", leave_type_name: null })]);
    const own = entries.filter((e) => e.user_id === employee.id);
    expect(own).toEqual([expect.objectContaining({ status: "approved", leave_type_name: "Annual" })]);
  });

  it("team_calendar rejects ranges longer than 62 days", async () => {
    const res = await asEmployee("team_calendar", { from: "2026-01-01", to: "2026-06-30" });
    expect(text(res)).toMatch(/1 to 62 days.*\(invalid_range\)$/);
    expect(text(res)).not.toMatch(/before the start date/);
  });

  it("signs in lazily with email and password, and reports bad credentials as a tool error", async () => {
    const env = {
      LMS_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      LMS_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      LMS_EMAIL: employee.email,
    };
    const good = await connect(createSessionProvider({ ...env, LMS_PASSWORD: employee.password }));
    expect(data(await good("whoami"))).toMatchObject({ id: employee.id });

    const bad = await connect(createSessionProvider({ ...env, LMS_PASSWORD: "wrong-password" }));
    const res = await bad("whoami");
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/Check LMS_EMAIL and LMS_PASSWORD\. \(invalid_credentials\)$/);
  });
});

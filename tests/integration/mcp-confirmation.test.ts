import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadViewer, type Session } from "../../src/server/mcp/session";
import { createLmsServer } from "../../src/server/mcp/tools";
import { cleanupUsers, createTestUser, signedInClient, type TestUser } from "./helpers";

const SECRET = "integration-secret-that-is-32-chars-or-more";

type Call = (name: string, args?: Record<string, unknown>) => Promise<CallToolResult>;
const clients: Client[] = [];

async function connectAs(user: TestUser, requireConfirmation: boolean): Promise<Call> {
  const db = await signedInClient(user.email, user.password);
  const session: Session = { db, me: await loadViewer(db) };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createLmsServer(async () => session, { requireConfirmation, confirmSecret: SECRET }).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  clients.push(client);
  return (name, args = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
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
  asEmployee = await connectAs(employee, true);
  asManager = await connectAs(manager, true);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await cleanupUsers();
});

const range = { leave_type: "Annual", start_date: "2027-03-01", end_date: "2027-03-02" };
const other = { leave_type: "Annual", start_date: "2027-03-08", end_date: "2027-03-09" };

async function pendingCount(call: Call, userId: string) {
  const { pending } = data<{ pending: { user_id: string }[] }>(await call("list_pending"));
  return pending.filter((p) => p.user_id === userId).length;
}

describe("write confirmations through the MCP server", () => {
  it("submit_leave without a token is refused and writes nothing", async () => {
    const res = await asEmployee("submit_leave", range);
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/\(confirmation_required\)$/);
    expect(data<{ requests: unknown[] }>(await asEmployee("list_my_requests")).requests).toEqual([]);
  });

  it("a preview with problems returns no token", async () => {
    const res = await asEmployee("preview_leave", { ...range, end_date: "2027-02-01" });
    expect(data(res)).not.toHaveProperty("confirmation");
  });

  it("a token for different dates is refused; the matching token submits", async () => {
    const preview = await asEmployee("preview_leave", range);
    const { confirmation } = data<{ confirmation: string }>(preview);
    expect(confirmation).toBeTruthy();

    const wrong = await asEmployee("submit_leave", { ...other, confirmation });
    expect(text(wrong)).toMatch(/\(confirmation_required\)$/);
    expect(data<{ requests: unknown[] }>(await asEmployee("list_my_requests")).requests).toEqual([]);

    const note = await asEmployee("submit_leave", { ...range, note: "Changed note is fine", confirmation });
    expect(note.isError).toBeFalsy();
    expect(data(note)).toMatchObject({ request: { status: "pending" } });
  });

  it("an employee can't preview or make decisions", async () => {
    const preview = await asEmployee("preview_decision", { request_id: crypto.randomUUID(), outcome: "approved" });
    expect(preview.isError).toBe(true);
    expect(text(preview)).toMatch(/\(not_allowed\)$/);

    const { confirmation } = data<{ confirmation: string }>(await asEmployee("preview_leave", other));
    const approve = await asEmployee("approve_request", { request_id: crypto.randomUUID(), confirmation });
    expect(approve.isError).toBe(true);
  });

  it("a manager previews a pending request, gets a token, and a token for another request is refused", async () => {
    const second = data<{ confirmation: string }>(await asEmployee("preview_leave", other));
    const submitted = await asEmployee("submit_leave", { ...other, confirmation: second.confirmation });
    const secondId = data<{ request: { id: string } }>(submitted).request.id;

    const queue = data<{ pending: { id: string; user_id: string; start_date: string }[] }>(await asManager("list_pending")).pending;
    const firstId = queue.find((q) => q.user_id === employee.id && q.start_date === range.start_date)!.id;

    const preview = await asManager("preview_decision", { request_id: firstId, outcome: "approved" });
    expect(preview.isError).toBeFalsy();
    expect(text(preview)).toMatch(/^Would approve /);
    const { confirmation } = data<{ confirmation: string }>(preview);
    expect(confirmation).toBeTruthy();

    // Token for the first request used on the second, and as a decline: both refused, both stay pending.
    const wrongRequest = await asManager("approve_request", { request_id: secondId, confirmation });
    expect(text(wrongRequest)).toMatch(/\(confirmation_required\)$/);
    const wrongTool = await asManager("decline_request", { request_id: firstId, reason: "No", confirmation });
    expect(text(wrongTool)).toMatch(/\(confirmation_required\)$/);
    expect(await pendingCount(asManager, employee.id)).toBe(2);

    const approved = await asManager("approve_request", { request_id: firstId, comment: "Enjoy", confirmation });
    expect(approved.isError).toBeFalsy();
    expect(data(approved)).toMatchObject({ request: { status: "approved", decided_by: manager.id } });

    // Replaying the used token changes nothing.
    const replay = await asManager("approve_request", { request_id: firstId, confirmation });
    expect(text(replay)).toMatch(/\(already_decided\)$/);
    expect(await pendingCount(asManager, employee.id)).toBe(1);
  });

  it("preview_decision on a request that isn't in the queue is not_found", async () => {
    const res = await asManager("preview_decision", { request_id: crypto.randomUUID(), outcome: "declined" });
    expect(text(res)).toMatch(/\(not_found\)$/);
  });

  it("with confirmations off, writes work without a token and previews return none", async () => {
    const local = await connectAs(employee, false);
    const preview = await local("preview_leave", { leave_type: "Annual", start_date: "2027-04-05", end_date: "2027-04-05" });
    expect(data(preview)).not.toHaveProperty("confirmation");
    const res = await local("submit_leave", { leave_type: "Annual", start_date: "2027-04-05", end_date: "2027-04-05" });
    expect(res.isError).toBeFalsy();
  });
});

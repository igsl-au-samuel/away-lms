import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signConfirmation, type ConfirmationTool } from "../../src/server/mcp/confirmation";
import type { Session } from "../../src/server/mcp/session";
import { createLmsServer } from "../../src/server/mcp/tools";

const SECRET = "unit-test-secret-that-is-32-chars-or-more";
const ME = "11111111-1111-4111-8111-111111111111";
const TYPE_ID = "22222222-2222-4222-8222-222222222222";
const REQ_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_REQ = "44444444-4444-4444-8444-444444444444";

let rpcCalls: string[] = [];

/** A client that records every RPC and returns an error, so a write that slips through is visible. */
function fakeDb() {
  const types = { data: [{ id: TYPE_ID, name: "Annual" }], error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(types),
  };
  return {
    from: () => chain,
    rpc: (name: string) => {
      rpcCalls.push(name);
      return Promise.resolve({ data: null, error: { message: "unexpected" } });
    },
  } as unknown as Session["db"];
}

const clients: Client[] = [];
async function connect(userId = ME) {
  const session = { db: fakeDb(), me: { id: userId } } as unknown as Session;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createLmsServer(async () => session, { requireConfirmation: true, confirmSecret: SECRET }).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  clients.push(client);
  return (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
}

const submitArgs = { leave_type: "Annual", start_date: "2026-11-02", end_date: "2026-11-04" };
const submitBound = { leave_type_id: TYPE_ID, start_date: "2026-11-02", end_date: "2026-11-04" };

const boundFor = (tool: ConfirmationTool): Record<string, unknown> =>
  tool === "submit_leave" ? submitBound : { request_id: REQ_ID, outcome: tool === "approve_request" ? "approved" : "declined" };

type Case = {
  tool: ConfirmationTool;
  args: Record<string, unknown>;
  bound: Record<string, unknown>;
  otherBound: Record<string, unknown>;
  otherTool: ConfirmationTool;
};

const cases: Case[] = [
  {
    tool: "submit_leave",
    args: submitArgs,
    bound: submitBound,
    otherBound: { ...submitBound, end_date: "2026-11-05" },
    otherTool: "approve_request",
  },
  {
    tool: "approve_request",
    args: { request_id: REQ_ID },
    bound: { request_id: REQ_ID, outcome: "approved" },
    otherBound: { request_id: OTHER_REQ, outcome: "approved" },
    otherTool: "decline_request",
  },
  {
    tool: "decline_request",
    args: { request_id: REQ_ID, reason: "Release week" },
    bound: { request_id: REQ_ID, outcome: "declined" },
    otherBound: { request_id: REQ_ID, outcome: "approved" },
    otherTool: "approve_request",
  },
];

beforeEach(() => {
  rpcCalls = [];
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
});

describe.each(cases)("$tool without a valid confirmation", ({ tool, args, bound, otherBound, otherTool }) => {
  const sign = (over: { sub?: string; tool?: ConfirmationTool; bound?: Record<string, unknown>; secret?: string; now?: number }) =>
    signConfirmation(
      { sub: over.sub ?? ME, tool: over.tool ?? tool, args: over.bound ?? bound },
      over.secret ?? SECRET,
      over.now,
    );

  const refusals: [string, () => Promise<string | undefined>][] = [
    ["no token", async () => undefined],
    ["an empty token", async () => ""],
    ["a token with no dot", async () => "abcdef"],
    ["a token that isn't base64url", async () => "a+b/c=.d e f"],
    ["a tampered payload", async () => `${(await sign({})).split(".")[0].slice(0, -2)}AA.${(await sign({})).split(".")[1]}`],
    ["a tampered signature", async () => `${(await sign({})).split(".")[0]}.AAAA${(await sign({})).split(".")[1].slice(4)}`],
    ["another secret", () => sign({ secret: "another-secret-that-is-32-chars-long!" })],
    ["an expired token", () => sign({ now: Date.now() - 11 * 60 * 1000 })],
    ["another user's token", () => sign({ sub: "55555555-5555-4555-8555-555555555555" })],
    ["another tool's token", () => sign({ tool: otherTool, bound: boundFor(otherTool) })],
    ["changed arguments", () => sign({ bound: otherBound })],
  ];

  it.each(refusals)("refuses %s with zero RPC calls", async (_label, makeToken) => {
    const call = await connect();
    const confirmation = await makeToken();
    const res = await call(tool, { ...args, ...(confirmation === undefined ? {} : { confirmation }) });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("(confirmation_required)");
    expect(rpcCalls).toEqual([]);
  });
});

describe("createLmsServer options", () => {
  it("throws when confirmations are required but the secret is short or missing", () => {
    const get = async () => ({}) as Session;
    expect(() => createLmsServer(get, { requireConfirmation: true })).toThrow();
    expect(() => createLmsServer(get, { requireConfirmation: true, confirmSecret: "short" })).toThrow();
    expect(() => createLmsServer(get)).not.toThrow();
  });
});

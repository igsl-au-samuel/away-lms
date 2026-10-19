import { describe, expect, it } from "vitest";
import { signConfirmation, verifyConfirmation, type ConfirmationTool } from "../../src/server/mcp/confirmation";

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const OTHER_SECRET = "another-secret-that-is-at-least-32-chars";
const NOW = Date.UTC(2026, 9, 19, 9, 0, 0);
const TEN_MIN = 10 * 60 * 1000;

const SUB = "11111111-1111-4111-8111-111111111111";
const TYPE_ID = "22222222-2222-4222-8222-222222222222";
const REQ_ID = "33333333-3333-4333-8333-333333333333";

const submit = { leave_type_id: TYPE_ID, start_date: "2026-11-02", end_date: "2026-11-04" };
const decision = { request_id: REQ_ID, outcome: "approved" };

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return b64url(String.fromCharCode(...sig));
}

/** A token with a correct signature over an arbitrary payload string. */
async function forge(payloadJson: string, secret = SECRET): Promise<string> {
  const p = b64url(payloadJson);
  return `${p}.${await hmac(p, secret)}`;
}

const sign = (tool: ConfirmationTool = "submit_leave", args: Record<string, unknown> = submit, sub = SUB, now = NOW) =>
  signConfirmation({ sub, tool, args }, SECRET, now);

describe("verifyConfirmation refusals", () => {
  it("refuses a missing token", async () => {
    for (const t of [undefined, null, ""]) {
      expect(await verifyConfirmation(t, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW)).toEqual({ ok: false, reason: "missing" });
    }
  });

  it("refuses a token with no dot", async () => {
    const r = await verifyConfirmation("abcdef", { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses a token that is not base64url", async () => {
    for (const t of ["a+b/c=.def", "abc.d e f", "a.b.c", ".abc", "abc."]) {
      const r = await verifyConfirmation(t, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
      expect(r).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("refuses a payload that is not JSON, even when correctly signed", async () => {
    const token = await forge("not json at all");
    const r = await verifyConfirmation(token, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses a correctly signed payload of the wrong shape", async () => {
    for (const p of ["[]", "null", '"x"', JSON.stringify({ sub: SUB, tool: "submit_leave", args: submit })]) {
      const r = await verifyConfirmation(await forge(p), { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
      expect(r).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("refuses a tampered payload", async () => {
    const [, sig] = (await sign()).split(".");
    const evil = b64url(JSON.stringify({ sub: SUB, tool: "submit_leave", args: { ...submit, end_date: "2026-12-31" }, exp: NOW + TEN_MIN }));
    const r = await verifyConfirmation(`${evil}.${sig}`, { sub: SUB, tool: "submit_leave", args: { ...submit, end_date: "2026-12-31" } }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a tampered signature", async () => {
    const [p, sig] = (await sign()).split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const r = await verifyConfirmation(`${p}.${flipped}`, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a signature of the wrong length", async () => {
    const [p, sig] = (await sign()).split(".");
    const r = await verifyConfirmation(`${p}.${sig.slice(0, -4)}`, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a token signed with another secret", async () => {
    const token = await signConfirmation({ sub: SUB, tool: "submit_leave", args: submit }, OTHER_SECRET, NOW);
    const r = await verifyConfirmation(token, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses an expired token one second past expiry", async () => {
    const token = await sign();
    const r = await verifyConfirmation(token, { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW + TEN_MIN + 1000);
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses another user", async () => {
    const token = await sign();
    const other = "44444444-4444-4444-8444-444444444444";
    const r = await verifyConfirmation(token, { sub: other, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "wrong_user" });
  });

  it("refuses another tool: a preview for approve cannot confirm decline", async () => {
    const token = await sign("approve_request", decision);
    const r = await verifyConfirmation(token, { sub: SUB, tool: "decline_request", args: decision }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "wrong_tool" });
  });

  it.each([
    ["leave type", "submit_leave", submit, { ...submit, leave_type_id: "55555555-5555-4555-8555-555555555555" }],
    ["start date", "submit_leave", submit, { ...submit, start_date: "2026-11-03" }],
    ["end date", "submit_leave", submit, { ...submit, end_date: "2026-11-05" }],
    ["request id", "approve_request", decision, { ...decision, request_id: "66666666-6666-4666-8666-666666666666" }],
    ["outcome", "approve_request", decision, { ...decision, outcome: "declined" }],
  ] as const)("refuses a changed %s", async (_label, tool, signed, used) => {
    const token = await sign(tool, signed);
    const r = await verifyConfirmation(token, { sub: SUB, tool, args: used }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "wrong_args" });
  });

  it("refuses when a bound argument is missing from the call", async () => {
    const token = await sign();
    const partial = { leave_type_id: submit.leave_type_id, start_date: submit.start_date };
    const r = await verifyConfirmation(token, { sub: SUB, tool: "submit_leave", args: partial }, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "wrong_args" });
  });

  it("throws on a short secret, when signing and when verifying", async () => {
    const short = "x".repeat(31);
    await expect(signConfirmation({ sub: SUB, tool: "submit_leave", args: submit }, short, NOW)).rejects.toThrow();
    await expect(verifyConfirmation(await sign(), { sub: SUB, tool: "submit_leave", args: submit }, short, NOW)).rejects.toThrow();
  });

  it("refuses to sign when a bound argument is missing", async () => {
    await expect(sign("submit_leave", { leave_type_id: TYPE_ID, start_date: "2026-11-02" })).rejects.toThrow();
  });
});

describe("confirmation happy path", () => {
  it("signs as base64url(payload).base64url(hmac) with exp ten minutes out", async () => {
    const token = await sign();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [p, sig] = token.split(".");
    expect(sig).toBe(await hmac(p, SECRET));
    const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload).toMatchObject({ sub: SUB, tool: "submit_leave", exp: NOW + TEN_MIN });
  });

  it("accepts a matching submit_leave", async () => {
    const r = await verifyConfirmation(await sign(), { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW);
    expect(r).toEqual({ ok: true });
  });

  it.each(["approve_request", "decline_request"] as const)("accepts a matching %s", async (tool) => {
    const args = { request_id: REQ_ID, outcome: tool === "approve_request" ? "approved" : "declined" };
    const r = await verifyConfirmation(await sign(tool, args), { sub: SUB, tool, args }, SECRET, NOW + 1000);
    expect(r).toEqual({ ok: true });
  });

  it("accepts right up to the expiry", async () => {
    const r = await verifyConfirmation(await sign(), { sub: SUB, tool: "submit_leave", args: submit }, SECRET, NOW + TEN_MIN);
    expect(r).toEqual({ ok: true });
  });

  it("ignores key order", async () => {
    const reordered = { end_date: submit.end_date, leave_type_id: submit.leave_type_id, start_date: submit.start_date };
    const r = await verifyConfirmation(await sign(), { sub: SUB, tool: "submit_leave", args: reordered }, SECRET, NOW);
    expect(r).toEqual({ ok: true });
  });

  it("does not bind the note or the comment", async () => {
    const s = await verifyConfirmation(await sign("submit_leave", { ...submit, note: "before" }), { sub: SUB, tool: "submit_leave", args: { ...submit, note: "after" } }, SECRET, NOW);
    expect(s).toEqual({ ok: true });
    const a = await verifyConfirmation(await sign("approve_request", { ...decision, comment: "one" }), { sub: SUB, tool: "approve_request", args: { ...decision, comment: "two" } }, SECRET, NOW);
    expect(a).toEqual({ ok: true });
  });

  it("does not put unbound arguments in the token", async () => {
    const token = await sign("submit_leave", { ...submit, note: "private words" });
    const decoded = atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
    expect(decoded).not.toContain("private words");
  });
});

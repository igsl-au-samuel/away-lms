import { afterAll, describe, expect, it } from "vitest";
import { cleanupUsers, createTestUser, secretClient, signedInClient } from "./helpers";

afterAll(cleanupUsers);

describe("decide_leave_request under concurrency", () => {
  it("lets exactly one of two parallel decisions through", async () => {
    const admin = secretClient();
    const employee = await createTestUser("employee");
    const manager = await createTestUser("manager");
    const types = await admin.from("leave_types").select("id").eq("name", "Annual").single();
    if (types.error) throw types.error;

    const submitted = await (await signedInClient(employee.email, employee.password)).rpc("submit_leave_request", {
      p_leave_type_id: types.data.id,
      p_start: "2026-09-07",
      p_end: "2026-09-11",
    });
    if (submitted.error) throw submitted.error;
    const requestId = submitted.data.id;

    // Two sessions, so the calls run on separate connections.
    const [a, b] = await Promise.all([
      signedInClient(manager.email, manager.password),
      signedInClient(manager.email, manager.password),
    ]);
    const results = await Promise.all([
      a.rpc("decide_leave_request", { p_request_id: requestId, p_outcome: "approved", p_comment: "Approve" }),
      b.rpc("decide_leave_request", { p_request_id: requestId, p_outcome: "declined", p_comment: "Decline" }),
    ]);

    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error?.message).toBe("already_decided");

    // The stored decision is the winner's, not a mix of both.
    const stored = await admin
      .from("leave_requests")
      .select("status, decision_comment, decided_by")
      .eq("id", requestId)
      .single();
    expect(stored.data?.decided_by).toBe(manager.id);
    expect(stored.data?.status).toBe(ok[0].data?.status);
    expect(stored.data?.decision_comment).toBe(ok[0].data?.decision_comment);
  });
});

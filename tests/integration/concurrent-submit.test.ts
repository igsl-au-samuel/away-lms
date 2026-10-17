import { afterAll, describe, expect, it } from "vitest";
import { cleanupUsers, createTestUser, secretClient, signedInClient } from "./helpers";

afterAll(cleanupUsers);

describe("submit_leave_request under concurrency", () => {
  it("lets exactly one of two overlapping submits through", async () => {
    const u = await createTestUser("employee");
    const types = await secretClient().from("leave_types").select("id").eq("name", "Annual").single();
    if (types.error) throw types.error;

    // Two sessions, so the calls run on separate connections.
    const [a, b] = await Promise.all([signedInClient(u.email, u.password), signedInClient(u.email, u.password)]);
    const results = await Promise.all([
      a.rpc("submit_leave_request", { p_leave_type_id: types.data.id, p_start: "2026-09-07", p_end: "2026-09-11" }),
      b.rpc("submit_leave_request", { p_leave_type_id: types.data.id, p_start: "2026-09-09", p_end: "2026-09-14" }),
    ]);

    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error?.message).toBe("overlap");

    const stored = await secretClient().from("leave_requests").select("id").eq("user_id", u.id);
    expect(stored.data).toHaveLength(1);
  });
});

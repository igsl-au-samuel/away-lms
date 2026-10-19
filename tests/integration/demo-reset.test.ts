// D4, SC-007: loading (and reloading) the demo never changes a real row.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadDemo, removeDemo } from "../../src/server/demo/loader";
import { DEMO_EMPLOYEES, DEMO_REQUESTS } from "../../src/server/demo/roster";
import { cleanupUsers, createTestUser, secretClient, signedInClient, type Db } from "./helpers";

const DEMO_PASSWORD = `Demo-${randomUUID()}`;

afterAll(async () => {
  await removeDemo(secretClient());
  await cleanupUsers();
});

async function demoIds(admin: Db): Promise<Set<string>> {
  const { data, error } = await admin.from("profiles").select("id").eq("is_demo", true);
  if (error) throw error;
  return new Set(data.map((r) => r.id));
}

/** Every real row of the four tables, sorted, as JSON. */
async function realRows(admin: Db): Promise<string> {
  const demo = await demoIds(admin);
  const isReal = (userId: string | null) => userId === null || !demo.has(userId);

  const profiles = await admin.from("profiles").select("*").order("id");
  const requests = await admin.from("leave_requests").select("*").order("id");
  const overrides = await admin.from("allowance_overrides").select("*").order("user_id").order("leave_type_id").order("year");
  const changes = await admin.from("allowance_changes").select("*").order("id");
  for (const r of [profiles, requests, overrides, changes]) if (r.error) throw r.error;

  return JSON.stringify({
    profiles: profiles.data!.filter((r) => !r.is_demo),
    leave_requests: requests.data!.filter((r) => isReal(r.user_id)),
    allowance_overrides: overrides.data!.filter((r) => isReal(r.user_id)),
    allowance_changes: changes.data!.filter((r) => isReal(r.user_id)),
  });
}

describe("demo reset (D4)", () => {
  it("loads the demo twice and leaves every real row byte-identical", async () => {
    const admin = secretClient();
    const adminUser = await createTestUser("admin");
    const decider = await signedInClient(adminUser.email, adminUser.password);

    // Real rows of every kind, so there is something to protect.
    const real = await createTestUser("employee");
    const realClient = await signedInClient(real.email, real.password);
    const { data: types } = await admin.from("leave_types").select("id, name, is_capped").eq("is_active", true);
    const annual = types!.find((t) => t.is_capped)!;
    const submitted = await realClient.rpc("submit_leave_request", {
      p_leave_type_id: annual.id,
      p_start: "2026-08-03",
      p_end: "2026-08-04",
    });
    expect(submitted.error).toBeNull();
    const override = await decider.rpc("admin_set_allowance", {
      p_user_id: real.id,
      p_leave_type_id: annual.id,
      p_year: 2026,
      p_days: 22,
      p_reason: "Integration test",
    });
    expect(override.error).toBeNull();

    const before = await realRows(admin);

    const first = await loadDemo({ admin, decider, password: DEMO_PASSWORD });
    expect(first).toEqual({ users: DEMO_EMPLOYEES.length, requests: DEMO_REQUESTS.length });
    const firstIds = await demoIds(admin);
    expect(firstIds.size).toBe(DEMO_EMPLOYEES.length);

    const second = await loadDemo({ admin, decider, password: DEMO_PASSWORD });
    expect(second).toEqual(first);
    const secondIds = await demoIds(admin);
    expect(secondIds.size).toBe(DEMO_EMPLOYEES.length);
    // A reset replaces the demo users rather than piling up new ones.
    expect([...secondIds].some((id) => firstIds.has(id))).toBe(false);

    expect(await realRows(admin)).toBe(before);
  });

  it("creates demo requests in every status, decided by the decider", async () => {
    const admin = secretClient();
    const demo = [...(await demoIds(admin))];
    const { data, error } = await admin
      .from("leave_requests")
      .select("status, decided_by, working_days")
      .in("user_id", demo);
    expect(error).toBeNull();
    expect(data).toHaveLength(DEMO_REQUESTS.length);
    expect(new Set(data!.map((r) => r.status))).toEqual(new Set(["pending", "approved", "declined"]));
    for (const r of data!) {
      expect(Number(r.working_days)).toBeGreaterThan(0);
      if (r.status !== "pending") expect(r.decided_by).not.toBeNull();
    }
  });

  it("lets a demo employee sign in with the supplied password", async () => {
    const email = DEMO_EMPLOYEES[0].email;
    await expect(signedInClient(email, DEMO_PASSWORD)).resolves.toBeDefined();
  });

  it("refuses a password shorter than 10 characters", async () => {
    const adminUser = await createTestUser("admin");
    const decider = await signedInClient(adminUser.email, adminUser.password);
    await expect(loadDemo({ admin: secretClient(), decider, password: "short" })).rejects.toThrow();
  });
});

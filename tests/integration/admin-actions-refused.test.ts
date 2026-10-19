// FR-005, US6-5: Server Actions can't run under Vitest, so this tests the layers they
// wrap. assertAdmin refuses non-admins, and with those same user-scoped clients every
// database operation behind an admin action is refused.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertAdmin } from "../../src/server/auth";
import { cleanupUsers, createTestUser, secretClient, signedInClient, type Db } from "./helpers";

let callers: { name: string; client: Db }[];
let adminClient: Db;
let target: string;
let annualId: string;
let holidayId: string;

beforeAll(async () => {
  const emp = await createTestUser("employee");
  const mgr = await createTestUser("manager");
  const off = await createTestUser("admin");
  const adm = await createTestUser("admin");
  const tgt = await createTestUser("employee");
  target = tgt.id;

  const offClient = await signedInClient(off.email, off.password);
  // Deactivated after signing in: the session is still valid, the profile is not.
  await secretClient().from("profiles").update({ is_active: false }).eq("id", off.id);

  callers = [
    { name: "employee", client: await signedInClient(emp.email, emp.password) },
    { name: "manager", client: await signedInClient(mgr.email, mgr.password) },
    { name: "inactive admin", client: offClient },
  ];
  adminClient = await signedInClient(adm.email, adm.password);

  const types = await secretClient().from("leave_types").select("id, is_capped").eq("is_capped", true).limit(1).single();
  annualId = types.data!.id;
  const holiday = await secretClient().from("public_holidays").select("id").limit(1).single();
  holidayId = holiday.data!.id;
});

afterAll(cleanupUsers);

/** A refused write either errors or touches no row. */
function expectRefused(res: { error: unknown; data: unknown }) {
  if (res.error) return;
  expect(Array.isArray(res.data) ? res.data : [res.data].filter(Boolean)).toHaveLength(0);
}

describe("assertAdmin", () => {
  it("returns the viewer for an active admin", async () => {
    await expect(assertAdmin(adminClient)).resolves.toMatchObject({ role: "admin" });
  });

  it.each(["employee", "manager", "inactive admin"])("throws not_allowed for %s", async (name) => {
    const { client } = callers.find((c) => c.name === name)!;
    await expect(assertAdmin(client)).rejects.toThrow("not_allowed");
  });
});

describe("database operations behind admin actions", () => {
  it.each(["employee", "manager", "inactive admin"])("are all refused for %s", async (name) => {
    const { client } = callers.find((c) => c.name === name)!;
    const suffix = randomUUID().slice(0, 6);

    // admin_* RPCs
    const rpcs = [
      client.rpc("admin_create_profile", {
        p_user_id: randomUUID(),
        p_full_name: "Nobody",
        p_email: `nobody-${suffix}@away.test`,
        p_role: "employee",
        p_region_code: "QLD",
      }),
      client.rpc("admin_update_user", { p_user_id: target, p_full_name: "Hacked", p_role: "admin", p_region_code: "QLD" }),
      client.rpc("admin_set_active", { p_user_id: target, p_active: false }),
      client.rpc("admin_set_demo_active", { p_active: false }),
      client.rpc("admin_set_allowance", { p_user_id: target, p_leave_type_id: annualId, p_year: 2026, p_days: 99 }),
    ];
    for (const res of await Promise.all(rpcs)) {
      expect(res.error?.message).toBe("not_allowed");
    }

    // leave_types
    expectRefused(await client.from("leave_types").insert({ name: `Nope ${suffix}`, is_capped: false }).select());
    expectRefused(await client.from("leave_types").update({ default_allowance: 99 }).eq("id", annualId).select());

    // holiday_regions
    expectRefused(await client.from("holiday_regions").insert({ code: "ZZ", name: "Nowhere", default_timezone: "UTC" }).select());
    expectRefused(await client.from("holiday_regions").update({ name: "Hacked" }).eq("code", "QLD").select());

    // public_holidays
    expectRefused(
      await client.from("public_holidays").insert({ region_code: "QLD", holiday_date: "2026-12-30", name: "Nope" }).select(),
    );
    expectRefused(await client.from("public_holidays").update({ name: "Hacked" }).eq("id", holidayId).select());
    expectRefused(await client.from("public_holidays").delete().eq("id", holidayId).select());
  });

  it("left the data unchanged", async () => {
    const admin = secretClient();
    const profile = await admin.from("profiles").select("full_name, role, is_active").eq("id", target).single();
    expect(profile.data).toEqual({ full_name: "Test employee", role: "employee", is_active: true });
    const annual = await admin.from("leave_types").select("default_allowance").eq("id", annualId).single();
    expect(Number(annual.data!.default_allowance)).not.toBe(99);
    const qld = await admin.from("holiday_regions").select("name").eq("code", "QLD").single();
    expect(qld.data!.name).not.toBe("Hacked");
    expect((await admin.from("holiday_regions").select("code").eq("code", "ZZ")).data).toHaveLength(0);
    const holiday = await admin.from("public_holidays").select("name").eq("id", holidayId).single();
    expect(holiday.data!.name).not.toBe("Hacked");
    const overrides = await admin.from("allowance_overrides").select("days").eq("user_id", target);
    expect(overrides.data).toHaveLength(0);
  });
});

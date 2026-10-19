// D5, FR-031: disabling the demo bans every demo user and sets is_active = false,
// and changes no real user. Enabling reverses it.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDemo, removeDemo } from "../../src/server/demo/loader";
import { setDemoActive } from "../../src/server/demo/active";
import { anonClient, cleanupUsers, createTestUser, secretClient, signedInClient, type Db } from "./helpers";
import { DEMO_EMPLOYEES } from "../../src/server/demo/roster";

const DEMO_PASSWORD = `Demo-${randomUUID()}`;
let adminUserClient: Db;

beforeAll(async () => {
  const adminUser = await createTestUser("admin");
  adminUserClient = await signedInClient(adminUser.email, adminUser.password);
  await loadDemo({ admin: secretClient(), decider: adminUserClient, password: DEMO_PASSWORD });
});

afterAll(async () => {
  await removeDemo(secretClient());
  await cleanupUsers();
});

async function snapshot(admin: Db) {
  const profiles = await admin.from("profiles").select("id, is_active, is_demo").order("id");
  if (profiles.error) throw profiles.error;
  const users = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (users.error) throw users.error;
  const banned = new Map(users.data.users.map((u) => [u.id, u.banned_until ?? null]));
  return profiles.data.map((p) => ({ ...p, banned_until: banned.get(p.id) ?? null }));
}

const isBanned = (until: string | null) => until !== null && new Date(until) > new Date();

describe("demo disable (D5)", () => {
  it("bans and deactivates every demo user and changes no real user", async () => {
    const admin = secretClient();
    const before = await snapshot(admin);

    const result = await setDemoActive({ admin, user: adminUserClient }, false);
    expect(result.ok).toBe(true);

    const after = await snapshot(admin);
    const demo = after.filter((p) => p.is_demo);
    expect(demo).toHaveLength(DEMO_EMPLOYEES.length);
    for (const p of demo) {
      expect(p.is_active).toBe(false);
      expect(isBanned(p.banned_until)).toBe(true);
    }
    expect(after.filter((p) => !p.is_demo)).toEqual(before.filter((p) => !p.is_demo));

    const signIn = await anonClient().auth.signInWithPassword({ email: DEMO_EMPLOYEES[0].email, password: DEMO_PASSWORD });
    expect(signIn.error).not.toBeNull();
  });

  it("setDemoActive(true) reverses it", async () => {
    const admin = secretClient();
    const before = await snapshot(admin);

    const result = await setDemoActive({ admin, user: adminUserClient }, true);
    expect(result.ok).toBe(true);

    const after = await snapshot(admin);
    for (const p of after.filter((p) => p.is_demo)) {
      expect(p.is_active).toBe(true);
      expect(isBanned(p.banned_until)).toBe(false);
    }
    expect(after.filter((p) => !p.is_demo)).toEqual(before.filter((p) => !p.is_demo));
    await expect(signedInClient(DEMO_EMPLOYEES[0].email, DEMO_PASSWORD)).resolves.toBeDefined();
  });

  it("refuses a non-admin caller and changes nothing", async () => {
    const admin = secretClient();
    const emp = await createTestUser("employee");
    const before = await snapshot(admin);
    const result = await setDemoActive({ admin, user: await signedInClient(emp.email, emp.password) }, false);
    expect(result).toMatchObject({ ok: false, code: "not_allowed" });
    expect(await snapshot(admin)).toEqual(before);
  });
});

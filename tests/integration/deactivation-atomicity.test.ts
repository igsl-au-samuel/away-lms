// #375 — deactivation is two writes in two systems: `profiles.is_active` in Postgres and a ban on
// the auth user in GoTrue. They cannot share a transaction, so the second write can fail after the
// first landed. Every test here forces that failure and asserts the resulting *state*. The invariant
// is the same in all of them: no account is left inactive in the database while Auth still admits
// it, because that is the state where the audit log describes a deactivation that enforcement does
// not deliver.
import { randomUUID } from "node:crypto";
import { AuthApiError } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setUserActive } from "../../src/server/admin-users";
import { getViewer } from "../../src/server/auth";
import { setDemoActive } from "../../src/server/demo/active";
import { loadDemo, removeDemo } from "../../src/server/demo/loader";
import {
  anonClient,
  cleanupUsers,
  createTestUser,
  secretClient,
  signedInClient,
  type Db,
} from "./helpers";

type BanCall = Parameters<Db["auth"]["admin"]["updateUserById"]>;
type Account = { is_active: boolean; banned_until: string | null };

const isBanned = (until: string | null) => until !== null && new Date(until) > new Date();

/** The hole: the profile says inactive, Auth says come in. */
const splitOpen = (a: Account) => !a.is_active && !isBanned(a.banned_until);

afterAll(cleanupUsers);

/**
 * A secret-key client that refuses to ban. `calls` records every id it was asked about, so a test
 * can tell "gave up on the loop" from "worked through every account and hit a wall". `onFail` runs
 * at the moment Auth fails, which is how a test breaks something *after* the profile flip: give it
 * a `signOut` and the compensating `admin_set_active` is refused by Postgres for real (anon holds
 * no execute grant) instead of by a manufactured error.
 */
function authRefusing(
  base: Db,
  { fail, calls, onFail }: { fail: (id: string) => boolean; calls: string[]; onFail?: () => Promise<unknown> },
): Db {
  const real = base.auth.admin.updateUserById.bind(base.auth.admin);
  base.auth.admin.updateUserById = async (...args: BanCall) => {
    calls.push(args[0]);
    if (!fail(args[0])) return real(...args);
    await onFail?.();
    return { data: { user: null }, error: new AuthApiError("forced: Auth is unavailable", 503, undefined) };
  };
  return base;
}

/** One admin's own client pair, fresh per test: a test that kills the session must not share it. */
async function adminClients() {
  const admin = await createTestUser("admin");
  return { admin: secretClient(), user: await signedInClient(admin.email, admin.password) };
}

async function account(id: string): Promise<Account> {
  const admin = secretClient();
  const profile = await admin.from("profiles").select("is_active").eq("id", id).single();
  if (profile.error) throw profile.error;
  const users = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (users.error) throw users.error;
  return { is_active: profile.data.is_active, banned_until: users.data.users.find((u) => u.id === id)?.banned_until ?? null };
}

describe("setUserActive when Auth refuses the ban (#375)", () => {
  it("undoes the deactivation instead of leaving the account inactive but admissible", async () => {
    const clients = await adminClients();
    const target = await createTestUser();
    const calls: string[] = [];

    const result = await setUserActive({ admin: authRefusing(secretClient(), { fail: () => true, calls }), user: clients.user }, target.id, false);

    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(calls).toEqual([target.id]);
    const state = await account(target.id);
    expect(state.is_active).toBe(true);
    expect(isBanned(state.banned_until)).toBe(false);
    expect(splitOpen(state)).toBe(false);
    await expect(anonClient().auth.signInWithPassword(target)).resolves.toMatchObject({ error: null });
  });

  it("keeps the mirror symmetric: a failed re-enable leaves the account inactive *and* banned", async () => {
    const clients = await adminClients();
    const target = await createTestUser();
    expect((await setUserActive(clients, target.id, false)).ok).toBe(true);

    const calls: string[] = [];
    const result = await setUserActive({ admin: authRefusing(secretClient(), { fail: () => true, calls }), user: clients.user }, target.id, true);

    expect(result).toMatchObject({ ok: false, code: "unknown" });
    const state = await account(target.id);
    // Reverted to inactive, which is only safe here because the original ban is still on. The
    // mirror bug would be reverting to inactive after the unban had already landed.
    expect(state.is_active).toBe(false);
    expect(isBanned(state.banned_until)).toBe(true);
    expect(splitOpen(state)).toBe(false);
    const signIn = await anonClient().auth.signInWithPassword(target);
    expect(signIn.error).not.toBeNull();
  });

  it("leaves no viewer when both the ban and the compensating flip fail", async () => {
    const clients = await adminClients();
    const target = await createTestUser();
    const calls: string[] = [];
    const admin = authRefusing(secretClient(), {
      fail: () => true,
      calls,
      // Auth fails, and the admin's session goes with it, so the revert is refused too.
      onFail: () => clients.user.auth.signOut({ scope: "local" }),
    });

    const result = await setUserActive({ admin, user: clients.user }, target.id, false);
    expect(result).toMatchObject({ ok: false, code: "unknown" });

    const state = await account(target.id);
    expect(state.is_active).toBe(false);
    expect(splitOpen(state)).toBe(true);
    // This is the state the sign-in page's "your account is no longer active" copy describes, so
    // the copy stays reachable from deactivation (#357 option 3, AC5). Auth still issues a session…
    const signIn = await anonClient().auth.signInWithPassword(target);
    expect(signIn.error).toBeNull();
    // …but whoami() returns nothing, which is what the app layout redirects on and what
    // setPassword now checks before it will rotate anything.
    expect(await getViewer(await signedInClient(target.email, target.password))).toBeNull();
  });
});

describe("setDemoActive when Auth refuses partway (#375)", () => {
  const DEMO_PASSWORD = `Demo-${randomUUID()}`;
  let adminClient: Db;

  type DemoRow = Account & { id: string; email: string };

  async function demoAccounts(): Promise<DemoRow[]> {
    const admin = secretClient();
    const profiles = await admin.from("profiles").select("id, email, is_active").eq("is_demo", true).order("id");
    if (profiles.error) throw profiles.error;
    const users = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (users.error) throw users.error;
    const banned = new Map(users.data.users.map((u) => [u.id, u.banned_until ?? null]));
    return profiles.data.map((p) => ({ ...p, banned_until: banned.get(p.id) ?? null }));
  }

  beforeAll(async () => {
    const adminUser = await createTestUser("admin");
    adminClient = await signedInClient(adminUser.email, adminUser.password);
    await loadDemo({ admin: secretClient(), decider: adminClient, password: DEMO_PASSWORD });
  });

  afterAll(async () => {
    await removeDemo(secretClient());
  });

  it("calls every demo account when one ban fails, then leaves none inactive", async () => {
    const before = await demoAccounts();
    expect(before.length).toBeGreaterThan(1);
    const broken = before[Math.floor(before.length / 2)].id;
    const calls: string[] = [];

    const result = await setDemoActive({ admin: authRefusing(secretClient(), { fail: (id) => id === broken, calls }), user: adminClient }, false);

    expect(result).toMatchObject({ ok: false, code: "unknown" });
    // The old code returned at this point and never reached the rest of the roster.
    expect(new Set(calls)).toEqual(new Set(before.map((d) => d.id)));
    expect(calls.filter((id) => id === broken)).toHaveLength(2);

    const after = await demoAccounts();
    expect(after.filter((d) => d.is_active)).toHaveLength(after.length);
    expect(after.filter((d) => splitOpen(d))).toHaveLength(0);
    // The accounts Auth did ban stay banned and active: locked out, which is the safe residue.
    expect(after.filter((d) => isBanned(d.banned_until))).toHaveLength(after.length - 1);
    expect(after.find((d) => d.id === broken)).toMatchObject({ is_active: true, banned_until: null });

    const brokenRow = after.find((d) => d.id === broken)!;
    const untouched = await anonClient().auth.signInWithPassword({ email: brokenRow.email, password: DEMO_PASSWORD });
    expect(untouched.error).toBeNull();
  });

  it("does not revert a failed re-enable, because reverting is what would open the hole", async () => {
    const clients = { admin: secretClient(), user: adminClient };
    expect((await setDemoActive(clients, false)).ok).toBe(true);
    const bannedBefore = await demoAccounts();
    expect(bannedBefore.filter((d) => !d.is_active && isBanned(d.banned_until))).toHaveLength(bannedBefore.length);

    const broken = bannedBefore[Math.floor(bannedBefore.length / 2)].id;
    const calls: string[] = [];
    const result = await setDemoActive({ admin: authRefusing(secretClient(), { fail: (id) => id === broken, calls }), user: adminClient }, true);

    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(new Set(calls)).toEqual(new Set(bannedBefore.map((d) => d.id)));

    const after = await demoAccounts();
    expect(after.filter((d) => splitOpen(d))).toHaveLength(0);
    // Every profile is back to active: the accounts Auth already unbanned are usable again, and the
    // one it refused is active but still banned. Flipping the whole set back to inactive here would
    // have made the already-unbanned accounts the mirror of the bug.
    expect(after.filter((d) => d.is_active)).toHaveLength(after.length);
    expect(after.filter((d) => isBanned(d.banned_until))).toHaveLength(1);
  });
});

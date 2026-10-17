import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { inviteUser, setUserActive } from "../../src/server/admin-users";
import {
  anonClient,
  cleanupUsers,
  createTestUser,
  secretClient,
  signedInClient,
  trackUser,
} from "./helpers";

afterAll(cleanupUsers);

async function findAuthUser(email: string) {
  const { data, error } = await secretClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email);
}

describe("sign-in", () => {
  it("lets an active user sign in", async () => {
    const u = await createTestUser();
    const { data, error } = await anonClient().auth.signInWithPassword(u);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(u.id);
  });

  it("refuses a banned user", async () => {
    const u = await createTestUser();
    await secretClient().auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    const { data, error } = await anonClient().auth.signInWithPassword(u);
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const u = await createTestUser();
    const wrongPassword = await anonClient().auth.signInWithPassword({ email: u.email, password: "not-the-password" });
    const unknownEmail = await anonClient().auth.signInWithPassword({
      email: `nobody-${randomUUID().slice(0, 8)}@away.test`,
      password: "not-the-password",
    });
    expect(wrongPassword.error).not.toBeNull();
    expect(unknownEmail.error).not.toBeNull();
    expect(wrongPassword.error?.code).toBe(unknownEmail.error?.code);
    expect(wrongPassword.error?.message).toBe(unknownEmail.error?.message);
  });
});

describe("admin-users", () => {
  it("inviteUser deletes the auth user when admin_create_profile fails", async () => {
    const adminUser = await createTestUser("admin");
    const clients = { admin: secretClient(), user: await signedInClient(adminUser.email, adminUser.password) };
    const email = `invite-${randomUUID().slice(0, 8)}@away.test`;

    const result = await inviteUser(clients, {
      email,
      full_name: "Should Not Exist",
      role: "employee",
      region_code: "NOPE", // no such region: admin_create_profile fails
    });

    expect(result.ok).toBe(false);
    expect(await findAuthUser(email)).toBeUndefined();
  });

  it("inviteUser creates the auth user and profile on success", async () => {
    const adminUser = await createTestUser("admin");
    const clients = { admin: secretClient(), user: await signedInClient(adminUser.email, adminUser.password) };
    const email = `invite-${randomUUID().slice(0, 8)}@away.test`;

    const result = await inviteUser(clients, { email, full_name: "Invited Person", role: "employee", region_code: "QLD" });

    expect(result.ok).toBe(true);
    const authUser = await findAuthUser(email);
    expect(authUser).toBeDefined();
    if (authUser) trackUser(authUser.id);
  });

  it("setUserActive bans and unbans", async () => {
    const adminUser = await createTestUser("admin");
    const target = await createTestUser();
    const clients = { admin: secretClient(), user: await signedInClient(adminUser.email, adminUser.password) };

    const off = await setUserActive(clients, target.id, false);
    expect(off.ok).toBe(true);
    const banned = await anonClient().auth.signInWithPassword(target);
    expect(banned.error).not.toBeNull();
    const profile = await secretClient().from("profiles").select("is_active").eq("id", target.id).single();
    expect(profile.data?.is_active).toBe(false);

    const on = await setUserActive(clients, target.id, true);
    expect(on.ok).toBe(true);
    const back = await anonClient().auth.signInWithPassword(target);
    expect(back.error).toBeNull();
  });

  it("setUserActive refuses a non-admin caller and does not ban", async () => {
    const employee = await createTestUser();
    const target = await createTestUser();
    const clients = { admin: secretClient(), user: await signedInClient(employee.email, employee.password) };

    const result = await setUserActive(clients, target.id, false);
    expect(result.ok).toBe(false);
    const signIn = await anonClient().auth.signInWithPassword(target);
    expect(signIn.error).toBeNull();
  });
});

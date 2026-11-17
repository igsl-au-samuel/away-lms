// #375, acceptance criterion 5. The split state a failed deactivation used to leave behind —
// `profiles.is_active = false` while Auth never got the ban — is built here directly, because the
// question is what the app does with that state, not which failure produced it. It is reachable:
// deactivation lands on it when both the ban and the compensating flip fail (proved in
// tests/integration/deactivation-atomicity.test.ts), so the "no longer active" copy stays.
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";

const NOT_ACTIVE = /your account is no longer active\. to have it reactivated, ask an administrator\./i;
const GENERIC_ERROR = /something went wrong/i;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const url = () => env("NEXT_PUBLIC_SUPABASE_URL");
const adminClient = () => createClient(url(), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const anonClient = () => createClient(url(), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });

type SplitAccount = { id: string; email: string; password: string };

/** An auth user with an inactive profile and no ban: exactly what a half-failed deactivation leaves. */
async function createSplitAccount(): Promise<SplitAccount> {
  const admin = adminClient();
  const email = `split-${Date.now()}@away.test`;
  const password = `Split-${Date.now()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const profile = await admin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: "Split State",
    role: "employee",
    region_code: "QLD",
    timezone: "Australia/Brisbane",
    is_active: false,
  });
  if (profile.error) throw profile.error;
  return { id: data.user.id, email, password };
}

async function signInThroughTheForm(page: Page, account: SplitAccount) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?error=no_profile/);
}

test("a half-deactivated account signing in is told to ask an administrator", async ({ page }) => {
  const account = await createSplitAccount();
  try {
    await signInThroughTheForm(page, account);
    // Auth accepted the credentials, the app found no viewer, and this layout is the only producer
    // of the error. The copy on the receiving end is what tells a person why nothing opened.
    // `.alert`, not `role="alert"`: the sign-in page's two error paragraphs have no role (#372).
    await expect(page.locator(".alert").filter({ hasText: NOT_ACTIVE })).toBeVisible();
  } finally {
    await adminClient().auth.admin.deleteUser(account.id);
  }
});

test("a half-deactivated account cannot rotate its own password", async ({ page }) => {
  const account = await createSplitAccount();
  const rotated = `Rotated-${Date.now()}`;
  try {
    await signInThroughTheForm(page, account);

    await page.goto("/set-password");
    await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
    await page.getByLabel("New password").fill(rotated);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: GENERIC_ERROR })).toBeVisible();

    // The state, not the message: the rotation never reached Auth, so the old password still works.
    const refused = await anonClient().auth.signInWithPassword({ email: account.email, password: rotated });
    expect(refused.error).not.toBeNull();
    expect(refused.data.session).toBeNull();

    const kept = await anonClient().auth.signInWithPassword({ email: account.email, password: account.password });
    expect(kept.error).toBeNull();
    expect(kept.data.user?.id).toBe(account.id);
  } finally {
    await adminClient().auth.admin.deleteUser(account.id);
  }
});

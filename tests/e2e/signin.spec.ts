import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { e2ePassword, expect, SEEDED, submitSignIn, test } from "./fixtures";

const GENERIC_ERROR = /invalid email or password/i;

/** The two alerts `src/app/(auth)/sign-in/page.tsx` renders straight from `?error=`. */
const EXPIRED_LINK = /that link has expired or was already used\. request a new one\./i;
const NOT_ACTIVE = /your account is no longer active\. to have it reactivated, ask an administrator\./i;
const alertWith = (page: Page, text: RegExp) => page.getByRole("alert").filter({ hasText: text });

test("a correct sign-in reaches the dashboard with name and role", async ({ page, login }) => {
  await login(SEEDED.employee1);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(SEEDED.employee1.name)).toBeVisible();
  await expect(page.getByText(/employee/i).first()).toBeVisible();
});

test("a wrong password shows the generic error", async ({ page }) => {
  await submitSignIn(page, SEEDED.employee1.email, "definitely-wrong");
  await expect(page.getByRole("alert").filter({ hasText: GENERIC_ERROR })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an expired or already-used link says so", async ({ page }) => {
  await page.goto("/sign-in?error=link");
  await expect(alertWith(page, EXPIRED_LINK)).toBeVisible();
  await expect(alertWith(page, NOT_ACTIVE)).toHaveCount(0);
});

test("a signed-in account with no active profile is told to ask an administrator", async ({ page }) => {
  await page.goto("/sign-in?error=no_profile");
  await expect(alertWith(page, NOT_ACTIVE)).toBeVisible();
  await expect(alertWith(page, EXPIRED_LINK)).toHaveCount(0);
});

test("an error the page does not know renders no alert and still offers the form", async ({ page }) => {
  await page.goto("/sign-in?error=unrecognised");
  // `.alert`, not `getByRole("alert")`: Next's route announcer also carries that role, so a
  // role-based count is never zero. The class is only ever set by these two paragraphs.
  await expect(page.locator(".alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("a deactivated user is refused", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  const email = `deactivated-${Date.now()}@away.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: e2ePassword(),
    email_confirm: true,
    ban_duration: "876000h",
  });
  if (error) throw error;
  try {
    await submitSignIn(page, email, e2ePassword());
    await expect(page.getByRole("alert").filter({ hasText: GENERIC_ERROR })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  } finally {
    await admin.auth.admin.deleteUser(data.user.id);
  }
});

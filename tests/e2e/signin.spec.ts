import { createClient } from "@supabase/supabase-js";
import { e2ePassword, expect, SEEDED, submitSignIn, test } from "./fixtures";

const GENERIC_ERROR = /invalid email or password/i;

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

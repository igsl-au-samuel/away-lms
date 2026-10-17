// US6 independent test: the admin creates a leave type, edits a user, overrides their
// allowance and adds a holiday; the user then sees it. Then the demo page loads and
// disables the demo. Everything created here is removed afterwards.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { leaveYear } from "../../src/lib/dates";
import { SEEDED, e2ePassword, expect, loginAs, test } from "./fixtures";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

test("an admin sets up a leave type, a user, an allowance and a holiday, and the user sees it", async ({ page }) => {
  const admin = adminClient();
  const suffix = randomUUID().slice(0, 6);
  const typeName = `E2E type ${suffix}`;
  const userName = `Tess Admin-e2e ${suffix}`;
  const email = `admin-e2e-${suffix}@away.test`;
  const year = leaveYear("Australia/Sydney");
  const holidayDate = `${year}-11-${String(10 + (parseInt(suffix, 16) % 18)).padStart(2, "0")}`;
  const holidayName = `E2E holiday ${suffix}`;

  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;

  try {
    const profile = await admin
      .from("profiles")
      .insert({ id, full_name: userName, email, role: "employee", region_code: "QLD", timezone: "Australia/Brisbane" });
    if (profile.error) throw profile.error;

    await loginAs(page, SEEDED.admin);

    // Leave type.
    await page.goto("/admin/leave-types");
    const add = page.getByRole("region", { name: "Add a leave type" });
    await add.getByLabel("Name").fill(typeName);
    await add.getByLabel("Default days a year").fill("4");
    await add.getByRole("button", { name: "Add leave type" }).click();
    await expect(add.getByRole("status")).toHaveText("Leave type added.");
    await page.reload();
    await expect(page.getByText(typeName, { exact: true }).first()).toBeVisible();

    // User: move to NSW.
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Users" }).click();
    const row = page.getByRole("row").filter({ hasText: userName });
    await row.getByText("Edit").click();
    await row.getByLabel("Region").selectOption("NSW");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toHaveText("Saved.");

    // Allowance override.
    await row.getByRole("link", { name: userName }).click();
    await page.waitForURL(`**/admin/users/${id}`);
    await page.getByLabel("Leave type").selectOption({ label: `${typeName} (default 4)` });
    await page.getByLabel(`Days in ${year}`).fill("6.5");
    await page.getByLabel("Reason (optional)").fill("E2E override");
    await page.getByRole("button", { name: "Save allowance" }).click();
    await expect(page.getByRole("status")).toHaveText("Allowance saved.");
    await page.reload();
    await expect(page.getByRole("cell", { name: "E2E override" })).toBeVisible();

    // Holiday in NSW.
    await page.goto(`/admin/holidays?region=NSW&year=${year}`);
    const holidays = page.getByRole("region", { name: new RegExp(`, ${year}$`) });
    const addHoliday = holidays.locator("form").first();
    await addHoliday.getByLabel("Date").fill(holidayDate);
    await addHoliday.getByLabel("Name").fill(holidayName);
    await addHoliday.getByRole("button", { name: "Add holiday" }).click();
    await expect(addHoliday.getByRole("status")).toHaveText("Holiday added.");
    await page.reload();
    await expect(page.getByText(holidayName, { exact: true }).first()).toBeVisible();

    // The user sees the new type with their override, and is in NSW.
    await page.goto("/auth/sign-out");
    await page.context().clearCookies();
    await loginAs(page, { email, name: userName, role: "employee" });
    const balance = page.getByRole("table", { name: /Leave balances/ }).getByRole("row").filter({ hasText: typeName });
    await expect(balance).toContainText("6.5 days");
    await page.goto("/profile");
    await expect(page.getByLabel("Region")).toHaveValue("NSW");
  } finally {
    await admin.auth.admin.deleteUser(id);
    await admin.from("public_holidays").delete().eq("name", holidayName);
    const type = await admin.from("leave_types").select("id").eq("name", typeName).maybeSingle();
    if (type.data) {
      await admin.from("allowance_changes").delete().eq("leave_type_id", type.data.id);
      await admin.from("allowance_overrides").delete().eq("leave_type_id", type.data.id);
      await admin.from("leave_types").delete().eq("id", type.data.id);
    }
  }
});

test("an admin loads the demo and disables every demo login", async ({ page }) => {
  const admin = adminClient();
  const removeDemo = async () => {
    const demo = await admin.from("profiles").select("id").eq("is_demo", true);
    for (const p of demo.data ?? []) await admin.auth.admin.deleteUser(p.id);
  };

  try {
    await loginAs(page, SEEDED.admin);
    await page.goto("/admin/demo");
    await expect(page.getByText("What this touches")).toBeVisible();

    await page.getByLabel("Password for every demo login").fill(`Demo-${randomUUID()}`);
    await page.getByRole("button", { name: /(Load|Reset) demo data/ }).click();
    await expect(page.getByRole("status")).toHaveText(/Demo data (loaded|reset)\./, { timeout: 60_000 });
    await expect(page.getByLabel("Password for every demo login")).toHaveValue("");

    await page.reload();
    await expect(page.getByText(/6 demo users, 6 of them can sign in\./)).toBeVisible();
    await page.getByRole("button", { name: "Disable all demo logins" }).click();
    await expect(page.getByRole("status")).toHaveText("Demo logins disabled.");
    await page.reload();
    await expect(page.getByText(/6 demo users, 0 of them can sign in\./)).toBeVisible();

    await page.goto("/admin/users");
    await expect(page.getByRole("row").filter({ hasText: "Jordan Pike" }).getByText("Demo", { exact: true })).toBeVisible();
  } finally {
    await removeDemo();
  }
});

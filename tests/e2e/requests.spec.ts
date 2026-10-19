import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { todayIn } from "../../src/lib/dates";
import { ERROR_COPY } from "../../src/lib/errors";
import { e2ePassword, expect, test } from "./fixtures";

const YEAR = Number(todayIn("Australia/Brisbane").slice(0, 4));

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

/** ISO date `days` after `iso` (UTC arithmetic, no time zone drift). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fillRequest(page: Page, start: string, end: string) {
  await page.getByLabel("Leave type").selectOption({ label: "Annual" });
  await page.getByLabel("Start date").fill(start);
  await page.getByLabel("End date").fill(end);
}

test("a QLD employee requests the Ekka week and sees it pending with the balance reduced", async ({ page, login }) => {
  const admin = adminClient();

  // The Ekka (a QLD-only Wednesday holiday) for this year, from the seeded holidays.
  const ekka = await admin
    .from("public_holidays")
    .select("holiday_date")
    .eq("region_code", "QLD")
    .ilike("name", "%Ekka%")
    .gte("holiday_date", `${YEAR}-01-01`)
    .lte("holiday_date", `${YEAR}-12-31`)
    .single();
  if (ekka.error) throw ekka.error;
  const monday = addDays(ekka.data.holiday_date, 1 - new Date(`${ekka.data.holiday_date}T00:00:00Z`).getUTCDay());
  const friday = addDays(monday, 4);

  const email = `requests-${Date.now()}@away.test`;
  const name = "Quinn Queensland";
  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  try {
    const profile = await admin.from("profiles").insert({
      id: userId,
      email,
      full_name: name,
      role: "employee",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    if (profile.error) throw profile.error;

    await login({ email, name, role: "employee" });
    const submit = page.getByRole("button", { name: "Submit request" });

    // A weekend-only range is blocked.
    await page.goto("/requests/new");
    await fillRequest(page, addDays(monday, 5), addDays(monday, 6));
    await expect(page.getByRole("alert").filter({ hasText: ERROR_COPY.no_working_days })).toBeVisible();
    await expect(submit).toBeDisabled();

    // The Ekka week counts 4 working days (Mon-Fri minus the Wednesday holiday).
    await fillRequest(page, monday, friday);
    await expect(page.getByRole("status").filter({ hasText: "4 working days" })).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL((url) => url.pathname === "/requests");
    const row = page.getByRole("row").filter({ hasText: "Pending" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Annual");
    await expect(row).toContainText("4");

    // Annual: 20 − 4 pending = 16 available.
    await page.goto("/");
    await expect(page.getByRole("row", { name: /^Annual/ })).toContainText("16 days");

    // The same week again overlaps the pending request.
    await page.goto("/requests/new");
    await fillRequest(page, monday, friday);
    await expect(page.getByRole("alert").filter({ hasText: ERROR_COPY.overlap })).toBeVisible();
    await expect(submit).toBeDisabled();

    // Four weeks from three weeks later: 20 working days against 16 available.
    // The shortfall is shown as a warning, and the request can still be submitted.
    await fillRequest(page, addDays(monday, 21), addDays(monday, 46));
    await expect(page.getByText(/over balance by \d+(\.\d)? days?/i)).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL((url) => url.pathname === "/requests");
    await expect(page.getByRole("row").filter({ hasText: "Pending" })).toHaveCount(2);
  } finally {
    await admin.from("leave_requests").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { e2ePassword, expect, loginAs, SEEDED, test } from "./fixtures";

// Holidays are seeded for 2026 in all three regions; 25 Dec is a holiday in each.
const MONTH = "2026-12";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

test("the calendar shows leave and regional holidays, and hides the leave type from employees (SC-003)", async ({
  browser,
  page,
}) => {
  const admin = adminClient();
  const stamp = Date.now();
  const pendingName = `Pia Pending ${stamp}`;
  const approvedName = `Hugo Approved ${stamp}`;
  const userIds: string[] = [];
  const managerContext = await browser.newContext();

  try {
    const manager = await admin.from("profiles").select("id").eq("email", SEEDED.manager.email).single();
    if (manager.error) throw manager.error;
    const annual = await admin.from("leave_types").select("id").eq("name", "Annual").single();
    if (annual.error) throw annual.error;

    const people = [
      { name: pendingName, region: "QLD", timezone: "Australia/Brisbane", start: `${MONTH}-07`, end: `${MONTH}-08`, status: "pending" },
      { name: approvedName, region: "HK", timezone: "Asia/Hong_Kong", start: `${MONTH}-09`, end: `${MONTH}-09`, status: "approved" },
    ] as const;

    for (const [i, p] of people.entries()) {
      const email = `calendar-${i}-${stamp}@away.test`;
      const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
      if (created.error) throw created.error;
      const id = created.data.user.id;
      userIds.push(id);

      const profile = await admin.from("profiles").insert({
        id,
        email,
        full_name: p.name,
        role: "employee",
        region_code: p.region,
        timezone: p.timezone,
      });
      if (profile.error) throw profile.error;

      const approved = p.status === "approved";
      const request = await admin.from("leave_requests").insert({
        user_id: id,
        leave_type_id: annual.data.id,
        start_date: p.start,
        end_date: p.end,
        region_code: p.region,
        working_days: p.start === p.end ? 1 : 2,
        status: p.status,
        decided_by: approved ? manager.data.id : null,
        decided_at: approved ? new Date().toISOString() : null,
      });
      if (request.error) throw request.error;
    }

    // An employee sees both people, labelled by status, and the regions' holidays.
    await loginAs(page, SEEDED.employee1);
    await page.goto(`/calendar?month=${MONTH}`);
    await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();

    const pendingRow = page.getByRole("row").filter({ hasText: pendingName });
    await expect(pendingRow.getByText("Pending leave")).toHaveCount(2);
    const approvedRow = page.getByRole("row").filter({ hasText: approvedName });
    await expect(approvedRow.getByText("Approved leave")).toHaveCount(1);

    for (const region of ["QLD", "NSW", "HK"]) {
      await expect(page.getByText(`${region} public holiday: Christmas Day`).first()).toBeAttached();
    }
    // FR-024a: no leave type for someone else's leave.
    await expect(pendingRow.getByText("Annual")).toHaveCount(0);
    await expect(pendingRow.locator("[title*='Annual']")).toHaveCount(0);

    // Month navigation.
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/month=2027-01/);
    await expect(page.getByRole("heading", { name: "January 2027" })).toBeVisible();
    await page.getByRole("link", { name: /Previous/ }).click();
    await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();

    // A manager sees the leave type.
    const managerPage = await managerContext.newPage();
    await loginAs(managerPage, SEEDED.manager);
    await managerPage.goto(`/calendar?month=${MONTH}`);
    await expect(
      managerPage.getByRole("row").filter({ hasText: pendingName }).locator("[title='Pending: Annual']"),
    ).toHaveCount(2);
  } finally {
    await managerContext.close();
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }
});

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { todayIn } from "../../src/lib/dates";
import { e2ePassword, expect, loginAs, SEEDED, test } from "./fixtures";

const YEAR = Number(todayIn("Australia/Brisbane").slice(0, 4));

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

test("a manager approves an over-balance request and the employee sees it taken (SC-002)", async ({
  browser,
  page,
}) => {
  const admin = adminClient();
  const email = `approvals-${Date.now()}@away.test`;
  const name = `Olive Overbalance ${Date.now()}`;

  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const employeeContext = await browser.newContext();

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

    // Annual allows 20 days. 25 working days is 5 over balance.
    const annual = await admin.from("leave_types").select("id").eq("name", "Annual").single();
    if (annual.error) throw annual.error;
    const request = await admin.from("leave_requests").insert({
      user_id: userId,
      leave_type_id: annual.data.id,
      start_date: `${YEAR}-03-02`,
      end_date: `${YEAR}-04-03`,
      region_code: "QLD",
      working_days: 25,
      over_balance_days: 5,
      note: "Long trip",
    });
    if (request.error) throw request.error;

    // The manager finds it in the queue, flagged, with the balance and the allowance log.
    await loginAs(page, SEEDED.manager);
    await page.goto("/approvals");
    const queueRow = page.getByRole("row").filter({ hasText: name });
    await expect(queueRow).toHaveCount(1);
    await expect(queueRow).toContainText("Annual");
    await expect(queueRow).toContainText("Long trip");
    await expect(queueRow).toContainText(/over balance by 5 days/i);
    await expect(queueRow).toContainText("−5 days"); // available now: 20 − 25

    await queueRow.getByLabel("Comment (optional)").fill("Approved, enjoy the trip");
    await queueRow.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);

    // The employee sees Approved with the comment, and taken has gone up.
    const employeePage = await employeeContext.newPage();
    await loginAs(employeePage, { email, name, role: "employee" });
    await employeePage.goto("/requests");
    const mine = employeePage.getByRole("row").filter({ hasText: "Approved" });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText("Approved, enjoy the trip");

    await employeePage.goto("/");
    const annualRow = employeePage.getByRole("row", { name: /^Annual/ });
    await expect(annualRow.getByRole("cell").nth(1)).toHaveText("25 days"); // taken
    await expect(annualRow.getByRole("cell").nth(2)).toHaveText("0 days"); // pending

    // An employee who opens /approvals gets the 403 page.
    await employeePage.goto("/approvals");
    await expect(employeePage.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  } finally {
    await employeeContext.close();
    await admin.from("leave_requests").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

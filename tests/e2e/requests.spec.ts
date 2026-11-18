import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { todayIn } from "../../src/lib/dates";
import { ERROR_COPY } from "../../src/lib/errors";
import { e2ePassword, expect, SEEDED, test } from "./fixtures";

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

test("My requests narrows to the status named in the URL", async ({ page, login }) => {
  const admin = adminClient();

  const email = `requests-filter-${Date.now()}@away.test`;
  const name = "Fiona Filtered";
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

    // A row is decided by somebody else, so the manager's own id is the only legal `decided_by`, and
    // the schema refuses a decided row that has lost its decision. Approved through the queue is
    // `approvals.spec.ts`'s job; this list only ever reads, so the two rows are placed as they end up.
    const decider = await admin.from("profiles").select("id").eq("email", SEEDED.manager.email).single();
    if (decider.error) throw decider.error;
    const types = await admin.from("leave_types").select("id, name").in("name", ["Annual", "Personal/Sick"]);
    if (types.error) throw types.error;
    const annual = types.data.find((t) => t.name === "Annual")?.id;
    const sick = types.data.find((t) => t.name === "Personal/Sick")?.id;
    if (!annual || !sick) throw new Error("The seeded leave types are missing.");

    const inserted = await admin.from("leave_requests").insert([
      {
        user_id: userId,
        leave_type_id: annual,
        start_date: `${YEAR}-03-02`,
        end_date: `${YEAR}-03-06`,
        region_code: "QLD",
        working_days: 5,
        note: "Pending trip",
      },
      {
        user_id: userId,
        leave_type_id: sick,
        start_date: `${YEAR}-05-04`,
        end_date: `${YEAR}-05-08`,
        region_code: "QLD",
        working_days: 3,
        note: "Approved course",
        status: "approved",
        decided_by: decider.data.id,
        decided_at: new Date().toISOString(),
        decision_comment: "Enjoy the course",
      },
    ]);
    if (inserted.error) throw inserted.error;

    await login({ email, name, role: "employee" });

    // One row per status, each named by its own note, so every case below has a different answer to
    // give and a filter that kept the wrong rows could not pass by counting the right number.
    const pendingRow = page.getByRole("row").filter({ hasText: "Pending trip" });
    const approvedRow = page.getByRole("row").filter({ hasText: "Approved course" });
    const tab = (label: string) => page.getByRole("link", { name: label, exact: true });

    await page.goto("/requests");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow).toHaveCount(1);
    await expect(tab("All")).toHaveAttribute("aria-current", "page");

    await page.goto("/requests?status=pending");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow, "?status=pending still shows the approved row").toHaveCount(0);
    await expect(tab("Pending")).toHaveAttribute("aria-current", "page");
    await expect(tab("All")).not.toHaveAttribute("aria-current", "page");

    await page.goto("/requests?status=approved");
    await expect(approvedRow).toHaveCount(1);
    await expect(pendingRow, "?status=approved still shows the pending row").toHaveCount(0);
    await expect(tab("Approved")).toHaveAttribute("aria-current", "page");
    // Narrowing the list must not narrow the row: who decided and what they said are the reason the
    // approved tab is worth clicking.
    await expect(approvedRow).toContainText(SEEDED.manager.name);
    await expect(approvedRow).toContainText("Enjoy the course");

    // Nothing for this filter, but the reader has requests — so say which filter came back empty
    // instead of claiming they have never asked for leave.
    await page.goto("/requests?status=declined");
    await expect(page.getByText("You have no declined requests.")).toBeVisible();
    await expect(page.getByText("You haven’t requested any leave yet.")).toHaveCount(0);

    // A value outside the three statuses is not a missing thing, so it is not an error: it is All.
    await page.goto("/requests?status=approved-ish");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow).toHaveCount(1);
    await expect(tab("All")).toHaveAttribute("aria-current", "page");

    // The tabs are links, which is what makes them keyboard-reachable and the filter a URL worth
    // pasting. `focus()` only fails if a tab stops being a real anchor — the point of the check.
    await tab("Pending").focus();
    await expect(tab("Pending")).toBeFocused();
    await tab("Pending").click();
    await page.waitForURL((url) => url.searchParams.get("status") === "pending");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow).toHaveCount(0);
  } finally {
    await admin.from("leave_requests").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

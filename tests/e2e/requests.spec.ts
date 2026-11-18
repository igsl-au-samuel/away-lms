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
  let colleagueId: string | null = null;

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

    // Both rows name every key, because a multi-row insert does not leave a missing one to its
    // column default: PostgREST takes the union of the keys and sends an explicit NULL for whatever
    // an object omitted. The first run of this test measured exactly that — `23502`, "null value in
    // column \"status\" … Failing row contains (…, Pending trip, null, null, null, null, …)", on the
    // row that had left `status` out. Naming it also states the schema's rule in the data: pending
    // means no decider and no decision time.
    const inserted = await admin.from("leave_requests").insert([
      {
        user_id: userId,
        leave_type_id: annual,
        start_date: `${YEAR}-03-02`,
        end_date: `${YEAR}-03-06`,
        region_code: "QLD",
        working_days: 5,
        note: "Pending trip",
        status: "pending",
        decided_by: null,
        decided_at: null,
        decision_comment: null,
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

    // A colleague, created only to be absent from every page below: an absence assertion with nothing
    // that could be absent is the vacuous kind, and this row is what gives the three `toHaveCount(0)`
    // cases something to say. It cannot show that the query's own `user_id` predicate is doing the
    // work — from an employee's seat RLS hides this row whatever the query asks for, which is #441.
    // `approvals.spec.ts`'s approved row is not the control either — that employee is the one looking.
    const colleagueEmail = `requests-filter-colleague-${Date.now()}@away.test`;
    const colleagueCreated = await admin.auth.admin.createUser({
      email: colleagueEmail,
      password: e2ePassword(),
      email_confirm: true,
    });
    if (colleagueCreated.error) throw colleagueCreated.error;
    colleagueId = colleagueCreated.data.user.id;

    const colleagueProfile = await admin.from("profiles").insert({
      id: colleagueId,
      email: colleagueEmail,
      full_name: "Colleague Cover",
      role: "employee",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    if (colleagueProfile.error) throw colleagueProfile.error;

    const colleagueRequest = await admin.from("leave_requests").insert({
      user_id: colleagueId,
      leave_type_id: annual,
      start_date: `${YEAR}-05-04`,
      end_date: `${YEAR}-05-08`,
      region_code: "QLD",
      working_days: 4,
      note: "Colleague approved",
      status: "approved",
      decided_by: decider.data.id,
      decided_at: new Date().toISOString(),
      decision_comment: "Cover is arranged",
    });
    if (colleagueRequest.error) throw colleagueRequest.error;

    await login({ email, name, role: "employee" });

    // Addressed by what the table actually renders — Type, Dates, Working days, Status, Decided by,
    // Comment — and not by the `note`, which this page has no column for. Each handle is a cell only
    // its own row has: the only 5-day row, the only Personal/Sick row, the colleague's own decision
    // comment. So every case below has a different answer to give, and a filter that kept the wrong
    // rows could not pass by counting the right number of them. The status words are avoided on
    // purpose: `hasText` is a case-insensitive substring, so "Pending" matches the empty state's
    // "You have no pending requests." too.
    const pendingRow = page.getByRole("row").filter({ hasText: "5 days" });
    const approvedRow = page.getByRole("row").filter({ hasText: "Personal/Sick" });
    const colleagueRow = page.getByRole("row").filter({ hasText: "Cover is arranged" });
    const tab = (label: string) => page.getByRole("link", { name: label, exact: true });

    await page.goto("/requests");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow).toHaveCount(1);
    await expect(colleagueRow, "unfiltered list shows a colleague's request").toHaveCount(0);
    await expect(tab("All")).toHaveAttribute("aria-current", "page");

    await page.goto("/requests?status=pending");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow, "?status=pending still shows the approved row").toHaveCount(0);
    await expect(tab("Pending")).toHaveAttribute("aria-current", "page");
    await expect(tab("All")).not.toHaveAttribute("aria-current", "page");

    await page.goto("/requests?status=approved");
    await expect(approvedRow).toHaveCount(1);
    await expect(pendingRow, "?status=approved still shows the pending row").toHaveCount(0);
    // Non-disclosure, end to end — and not a test of the query line. `leave_requests_select` in
    // 20261017002100_policies_leave_requests.sql:7 gives a non-approver `user_id = auth.uid()`, so RLS
    // keeps this row away from the session whatever the builder asks for; deleting
    // `.eq("user_id", viewer.id)` would not redden anything here. The predicate is load-bearing for a
    // role whose policy already allows every row, and no spec opens /requests from that seat — #441.
    await expect(colleagueRow, "?status=approved shows a colleague's approved request").toHaveCount(0);
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

    // A value outside the three statuses is not a missing thing, so it is not an error: it is All —
    // the same rows `/requests` with nothing on it already shows the reader, and no more. That
    // equality is why the fallback widens over one person's own list rather than disclosing: the
    // parameter can only ever narrow inside `.eq("user_id", viewer.id)`.
    await page.goto("/requests?status=approved-ish");
    await expect(pendingRow).toHaveCount(1);
    await expect(approvedRow).toHaveCount(1);
    await expect(colleagueRow, "?status=approved-ish shows a colleague's request").toHaveCount(0);
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
    for (const id of colleagueId ? [userId, colleagueId] : [userId]) {
      await admin.from("leave_requests").delete().eq("user_id", id);
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }
});

import { createClient } from "@supabase/supabase-js";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../../src/lib/database.types";
import { formatPlainDate, todayIn } from "../../src/lib/dates";
import { e2ePassword, expect, loginAs, SEEDED, test } from "./fixtures";

const YEAR = Number(todayIn("Australia/Brisbane").slice(0, 4));

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

/**
 * A059 owns this route, and A060 can move it, so the file system decides rather than a string here:
 * the URL is whichever `history/page.tsx` exists, with route groups removed. `""` is no page yet.
 */
function historyRoute(): string {
  const appDir = resolve(__dirname, "../../src/app");
  for (const entry of readdirSync(appDir, { recursive: true })) {
    const parts = String(entry).split(/[\\/]/);
    if (parts.at(-1) !== "page.tsx" || parts.at(-2) !== "history") continue;
    return `/${parts.slice(0, -1).filter((p) => !p.startsWith("(")).join("/")}`;
  }
  return "";
}

const HISTORY = historyRoute();

// Guarded, not missing (decision 7). The walk looks for a directory called `history` rather than for
// one path, so the guard cannot stay in place because A059 put the page one level deeper.
test.skip(HISTORY === "", "the my-history page does not exist yet (A059)");

// There is no empty-state test in this file, and one is not reachable: `audit_profiles` writes a
// `user_created` entry for every profile insert, and `audit_my_history` returns entries whose subject
// is the caller, so no signed-in user can have zero rows. A058 renders that state as a component.
//
// Nor can a failing load be provoked from the browser: a server component calls PostgREST from the
// Node process, which `page.route` does not see, and the shared local stack is not somebody's test
// fixture. A cursor the database refuses is the failure a user can actually reach.
//
// What the browser cannot see, the test process can make itself: `readHistoryAs` is the page's own
// read, issued as the same role, so an alert on the page next to a null error here is a bug in the
// app, and an error here is the database or its API answering differently than pgTAP does.

/**
 * `audit_my_history` called over PostgREST as a signed-in email/password user — the read A059's page
 * makes, from outside the page. The assertion is the report: `message` reaches the CI log when the
 * test fails, and the PostgREST error is the thing the rendered alert deliberately does not show.
 */
async function readHistoryAs(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");
  const c = createClient<Database>(url, key, { auth: { persistSession: false } });
  const signed = await c.auth.signInWithPassword({ email, password: e2ePassword() });
  if (signed.error) throw signed.error;
  const res = await c.rpc("audit_my_history", { p_limit: 50 });
  expect.soft(res.error, `audit_my_history as ${email}: ${JSON.stringify(res.error)}`).toBeNull();
  return res;
}

/**
 * The entry `describeEntry` builds for a submission. A053 pins that sentence as one string, so the
 * phrase and the date are one text run and the gap between them is only the leave type name.
 * `formatPlainDate` emits letters, digits and spaces, so its output needs no escaping.
 */
const submittedOn = (startIso: string) => new RegExp(`submitted a request[\\s\\S]{0,60}${formatPlainDate(startIso)}`);

type Employee = { id: string; email: string; name: string; role: string; start: string };

/**
 * An employee holding one pending request, written through the service role as `approvals.spec.ts`
 * does, so the audit entry comes from the trigger and its actor is System. That is the useful case:
 * the sentence has to name the requester, not whoever wrote the row.
 */
async function employeeWithRequest(admin: ReturnType<typeof adminClient>, tag: string, start: string, end: string) {
  const email = `audit-${tag}-${Date.now()}@away.test`;
  const name = `Audrey ${tag} ${Date.now()}`;
  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  const annual = await admin.from("leave_types").select("id").eq("name", "Annual").single();
  if (annual.error) throw annual.error;

  try {
    const profile = await admin.from("profiles").insert({
      id,
      email,
      full_name: name,
      role: "employee",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    if (profile.error) throw profile.error;

    const request = await admin.from("leave_requests").insert({
      user_id: id,
      leave_type_id: annual.data.id,
      start_date: start,
      end_date: end,
      region_code: "QLD",
      working_days: 2,
      // Null, not 0: the column's own check is `over_balance_days > 0` (20261017000300:10), and
      // `submit_leave_request` writes `nullif(least(...), 0)` (20261017060000:146) — a request
      // within balance has no shortfall to record, and zero is not "none", it is a negative number
      // of days nobody can borrow.
      over_balance_days: null,
    });
    if (request.error) throw request.error;

    return { id, email, name, role: "employee", start } satisfies Employee;
  } catch (error) {
    await removeEmployee(admin, { id });
    throw error;
  }
}

async function removeEmployee(admin: ReturnType<typeof adminClient>, employee: { id: string }) {
  await admin.from("leave_requests").delete().eq("user_id", employee.id);
  await admin.from("profiles").delete().eq("id", employee.id);
  await admin.auth.admin.deleteUser(employee.id);
}

test("an employee sees the entry for their own request and not for their colleague's", async ({
  login,
  page,
  browser,
}) => {
  const admin = adminClient();
  const mine = await employeeWithRequest(admin, "own", `${YEAR}-03-02`, `${YEAR}-03-03`);
  const theirs = await employeeWithRequest(admin, "colleague", `${YEAR}-05-04`, `${YEAR}-05-05`);
  const colleagueContext = await browser.newContext();

  try {
    await login(mine);
    await page.goto(HISTORY);
    const entry = page.getByText(submittedOn(mine.start));
    await expect(entry).toBeVisible();
    await expect(entry).toContainText(mine.name);
    await expect(page.getByText(submittedOn(theirs.start))).toHaveCount(0);

    // The colleague's entry does exist, on their own page. Without this the count above would also be
    // satisfied by a history page that shows nothing to anybody.
    const colleaguePage = await colleagueContext.newPage();
    await loginAs(colleaguePage, theirs);
    await colleaguePage.goto(HISTORY);
    await expect(colleaguePage.getByText(submittedOn(theirs.start))).toBeVisible();
  } finally {
    await colleagueContext.close();
    await removeEmployee(admin, theirs);
    await removeEmployee(admin, mine);
  }
});

test("a manager sees an employee's submission that is not one of their own entries", async ({ login, page }) => {
  const admin = adminClient();
  const employee = await employeeWithRequest(admin, "decidable", `${YEAR}-07-06`, `${YEAR}-07-07`);

  try {
    await login(SEEDED.manager);
    await page.goto(HISTORY);
    // The manager is neither the actor nor the subject. The entry is here because they can decide it,
    // which is the page's half of row 42 (A051) — the SQL half cannot show a broken `searchParams`.
    const entry = page.getByText(submittedOn(employee.start));
    await expect(entry).toBeVisible();
    await expect(entry).toContainText(employee.name);
  } finally {
    await removeEmployee(admin, employee);
  }
});

test("a cursor the database cannot use shows the error state, and the retry link clears it", async ({ login, page }) => {
  await login(SEEDED.employee1);

  // The read itself, seen from outside the page: if the alert below has a database-side reason, this
  // is where the CI log learns what it was.
  const rows = (await readHistoryAs(SEEDED.employee1.email)).data?.length ?? 0;

  // Control first: the same page without a cursor loads cleanly, so the alert below cannot be the
  // whole route failing for a reason that has nothing to do with the cursor.
  await page.goto(HISTORY);
  await expect(page.getByRole("alert"), `${rows} rows returned to the test process`).toHaveCount(0);

  await page.goto(`${HISTORY}?before_at=not-a-date`);
  await expect(page.getByRole("alert")).toContainText(/try again/i);

  // The remedy, not the disease: the link returns to the bare route with no cursor left in the URL.
  await page.getByRole("link", { name: /try again/i }).click();
  await expect(page).toHaveURL(new RegExp(`^https?://[^/]+${HISTORY}$`));
  await expect(page.getByRole("alert")).toHaveCount(0);
});

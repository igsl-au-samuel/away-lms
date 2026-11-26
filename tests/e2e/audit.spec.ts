import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
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

/**
 * The entry `describeEntry` builds for a submission. A053 pins that sentence as one string, so the
 * phrase and the date are one text run and the gap between them is only the leave type name.
 * `formatPlainDate` emits letters, digits and spaces, so its output needs no escaping.
 */
const submittedOn = (startIso: string) => new RegExp(`submitted a request[\\s\\S]{0,60}${formatPlainDate(startIso)}`);

type Employee = { id: string; email: string; name: string; role: string; start: string; requestId: string };

/**
 * An employee holding one pending request, written through the service role as `approvals.spec.ts`
 * does, so the audit entry comes from the trigger and its actor is System. That is the useful case:
 * the sentence has to name the requester, not whoever wrote the row.
 *
 * `demo` is set on the profile in the same insert that creates it, because `private.audit_write`
 * copies `is_demo` from the subject at write time and never recomputes it (research R4) — flipping it
 * afterwards would leave the `user_created` entry marked real.
 */
async function employeeWithRequest(
  admin: ReturnType<typeof adminClient>,
  tag: string,
  start: string,
  end: string,
  demo = false,
) {
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
      is_demo: demo,
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
    })
      .select("id")
      .single();
    if (request.error) throw request.error;

    return { id, email, name, role: "employee", start, requestId: request.data.id } satisfies Employee;
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

  // Control first: the same page without a cursor loads cleanly, so the alert below cannot be the
  // whole route failing for a reason that has nothing to do with the cursor.
  //
  // `.alert`, not `getByRole("alert")`, for every assertion in this test: Next's route announcer
  // also carries that role (measured in #388, and the reason `signin.spec.ts:39` and
  // `forgot-password.spec.ts:30` say the same thing), so a role-based count is never zero and the
  // retry paragraph is only one of the two matches. The class is set by A058's paragraph alone.
  await page.goto(HISTORY);
  await expect(page.locator(".alert")).toHaveCount(0);

  await page.goto(`${HISTORY}?before_at=not-a-date`);
  await expect(page.locator(".alert")).toContainText(/try again/i);

  // The remedy, not the disease: the link returns to the bare route with no cursor left in the URL.
  await page.getByRole("link", { name: /try again/i }).click();
  await expect(page).toHaveURL(new RegExp(`^https?://[^/]+${HISTORY}$`));
  await expect(page.locator(".alert")).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------
// A067 — the admin Audit page, its filters, its export, and who is refused all of them.
//
// Skipped until A072 and A073 land, and the guard does not know either route's name: it walks
// `src/app` for whichever `audit/page.tsx` and `audit/export/route.ts` exist and builds the URLs from
// the directories, the same way `HISTORY` above is derived (decision 7). Hard-coding `/admin/audit`
// would leave six tests skipped forever the day the page arrived one directory over.
//
// What this file pins that nothing else can:
//   * that the admin page is not the My-history page wearing an admin hat — an entry about somebody
//     else, on a page the admin is neither actor nor subject of (RLS cannot tell those two pages apart);
//   * the seven filter names as they appear in a URL, because A071's `<form>` and A073's route handler
//     read them from the query, and `tests/unit/audit.test.ts` only proves what `parseFilters` thinks;
//   * that `role` is the actor's role and not the subject's, which is the difference between
//     `?role=manager` finding the decision and `?role=employee` finding nothing;
//   * that Export CSV is the *filtered* list (FR-025), in the same query, with the same rows;
//   * that a non-admin is refused at the route handler too, not only at the page.
// ---------------------------------------------------------------------------------------------

/** `src/components/forbidden.tsx` does not export its copy, so it is pinned here (as in access.spec.ts). */
const REFUSAL = "You don't have access to this page";

/**
 * The two routes A072 and A073 own. A directory called `audit` holding `page.tsx`, and an `export`
 * directory under it holding `route.ts`; route groups come out of the path, so `(app)` never appears
 * in a URL. `""` is "not built yet".
 */
function auditRoutes(): { page: string; exporter: string } {
  const appDir = resolve(__dirname, "../../src/app");
  const found = { page: "", exporter: "" };
  for (const entry of readdirSync(appDir, { recursive: true })) {
    const parts = String(entry)
      .split(/[\\/]/)
      .filter((p) => !p.startsWith("("));
    const leaf = parts.at(-1);
    if (found.page === "" && leaf === "page.tsx" && parts.at(-2) === "audit") {
      found.page = `/${parts.slice(0, -1).join("/")}`;
    }
    if (found.exporter === "" && leaf === "route.ts" && parts.at(-2) === "export" && parts.at(-3) === "audit") {
      found.exporter = `/${parts.slice(0, -1).join("/")}`;
    }
  }
  return found;
}

const AUDIT = auditRoutes();

/** The rows the page renders, read off the list A057's `EntryList` names. */
const entryRows = (page: Page) => page.getByRole("list", { name: "History entries" }).locator("> li");

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

/**
 * Approve a request as the seeded manager, through PostgREST with a real session.
 *
 * Through the UI this is `approvals.spec.ts`'s job, and it would test that page rather than this one.
 * What matters here is who the audit entry says the actor was: a service-role write leaves
 * `actor_id` null and `actor_role` null, so no `?role=` filter could ever match it, and the sentence
 * would read `System`. Signed in as the manager, the entry carries `actor_role = manager` — which is
 * the only way this file can tell `role` (the actor) apart from `person` (usually the subject).
 */
async function decideAsManager(requestId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");
  }
  const c = createClient<Database>(url, publishable, { auth: { persistSession: false } });
  const signIn = await c.auth.signInWithPassword({ email: SEEDED.manager.email, password: e2ePassword() });
  if (signIn.error) throw signIn.error;
  const decided = await c.rpc("decide_leave_request", { p_request_id: requestId, p_outcome: "approved" });
  await c.auth.signOut();
  if (decided.error) throw decided.error;
}

/** The zone the export filename and the page's own timestamps are measured in: the admin's. */
async function adminTimezone(admin: ReturnType<typeof adminClient>): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("timezone")
    .eq("email", SEEDED.admin.email)
    .single();
  if (error) throw error;
  return data.timezone;
}

test.describe("the admin Audit page", () => {
  test.skip(
    AUDIT.page === "" || AUDIT.exporter === "",
    "the Audit page (A072) and its export route (A073) do not exist yet",
  );

  test("the admin sees an entry they neither made nor are named in, newest first", async ({
    login,
    page,
  }) => {
    const admin = adminClient();
    const person = await employeeWithRequest(admin, "newest", `${YEAR}-03-02`, `${YEAR}-03-03`);
    await decideAsManager(person.requestId);

    try {
      await login(SEEDED.admin);

      // Ordering is pinned under `person`, where no other spec can crowd it: three entries, written in
      // a known order, in a list of one person's rows. The decision is the newest because its
      // `created_at` is `decided_at` (20261116062030:152), which is after the submission's row insert.
      await page.goto(`${AUDIT.page}?${query({ person: person.id })}`);
      await expect(entryRows(page)).toHaveCount(3);
      await expect(entryRows(page).nth(0)).toContainText(/approved/);
      await expect(entryRows(page).nth(1)).toContainText(submittedOn(person.start));
      await expect(entryRows(page).nth(2)).toContainText(/created .*account/);

      // And the same row is on the *unfiltered* page. The viewer is neither its actor nor its subject,
      // so a page that reused `audit_my_history` would fail here while passing every assertion above.
      // Its own entry, written seconds earlier, is on the first page of a newest-first list.
      //
      // Named as well as dated, because the date is not this test's to count: `${YEAR}-03-02` is also
      // the start date at approvals.spec.ts:45, balances.spec.ts:43, requests.spec.ts:151 and line 127
      // above, and `audit_log` is append-only, so no cleanup removes a finished run's row. A date-only
      // count is a count of the whole first page, which is why it grew by one on every retry.
      await page.goto(AUDIT.page);
      await expect(entryRows(page).filter({ hasText: person.name }).filter({ hasText: submittedOn(person.start) })).toHaveCount(1);
      await expect(entryRows(page).filter({ hasText: person.name })).toHaveCount(3);
    } finally {
      await removeEmployee(admin, person);
    }
  });

  test("demo entries stay off the list until the filter asks for them (D9)", async ({ login, page }) => {
    const admin = adminClient();
    const real = await employeeWithRequest(admin, "real", `${YEAR}-04-06`, `${YEAR}-04-07`);
    const demo = await employeeWithRequest(admin, "demo", `${YEAR}-08-10`, `${YEAR}-08-11`, true);

    try {
      await login(SEEDED.admin);

      // The real one is here by default…
      await page.goto(`${AUDIT.page}?${query({ person: real.id })}`);
      await expect(entryRows(page).filter({ hasText: submittedOn(real.start) })).toHaveCount(1);

      // …and the demo one is not, although it exists.
      await page.goto(`${AUDIT.page}?${query({ person: demo.id })}`);
      await expect(entryRows(page)).toHaveCount(0);

      // Both halves of the toggle are filters, not one of them "everything": asking for demo finds the
      // demo row and loses the real one.
      await page.goto(`${AUDIT.page}?${query({ person: demo.id, demo: "true" })}`);
      await expect(entryRows(page).filter({ hasText: submittedOn(demo.start) })).toHaveCount(1);
      await page.goto(`${AUDIT.page}?${query({ person: real.id, demo: "true" })}`);
      await expect(entryRows(page)).toHaveCount(0);

      // FR-029, and the state `audit-states.tsx` says only this page can really reach: a filter
      // combination with nothing behind it. "No history yet" is not true of it — the history exists,
      // the filters excluded it — so the admin page has to say so, or a reader keeps a bad query.
      await expect(page.getByText(/no entries match/i)).toBeVisible();
    } finally {
      await removeEmployee(admin, demo);
      await removeEmployee(admin, real);
    }
  });

  test("each filter narrows the list to what its name says", async ({ login, page }) => {
    const admin = adminClient();
    const person = await employeeWithRequest(admin, "filters", `${YEAR}-05-11`, `${YEAR}-05-12`);
    await decideAsManager(person.requestId);

    // One person's three entries, and only that person's: the seeded stack holds hundreds of rows, and
    // a count taken from the whole log would be a number that moves.
    const withFilter = (params: Record<string, string>) => query({ person: person.id, ...params });
    const url = (params: Record<string, string>) => `${AUDIT.page}?${withFilter(params)}`;

    try {
      await login(SEEDED.admin);

      await page.goto(url({}));
      await expect(entryRows(page)).toHaveCount(3);

      await page.goto(url({ action: "request_submitted" }));
      await expect(entryRows(page)).toHaveCount(1);

      await page.goto(url({ entity: "user" }));
      await expect(entryRows(page)).toHaveCount(1);

      await page.goto(url({ entity: "leave_request" }));
      await expect(entryRows(page)).toHaveCount(2);

      // The pair that says what `role` means. The subject of all three rows is an employee; only the
      // decision has a manager behind it. Read as the subject's role, `role=manager` would be empty
      // and `role=employee` would be three.
      await page.goto(url({ role: "manager" }));
      await expect(entryRows(page)).toHaveCount(1);
      await expect(entryRows(page).first()).toContainText(/approved/);
      await page.goto(url({ role: "employee" }));
      await expect(entryRows(page)).toHaveCount(0);

      // Two filters narrow further than one.
      await page.goto(url({ action: "request_approved", role: "employee" }));
      await expect(entryRows(page)).toHaveCount(0);
      await page.goto(url({ action: "request_approved", role: "manager" }));
      await expect(entryRows(page)).toHaveCount(1);
    } finally {
      await removeEmployee(admin, person);
    }
  });

  test("Export CSV is the filtered list, in the same query, with the same rows", async ({ login, page }) => {
    const admin = adminClient();
    const person = await employeeWithRequest(admin, "export", `${YEAR}-06-15`, `${YEAR}-06-16`);
    await decideAsManager(person.requestId);
    const tz = await adminTimezone(admin);

    try {
      await login(SEEDED.admin);
      const filters = query({ person: person.id });
      await page.goto(`${AUDIT.page}?${filters}`);
      const rows = await entryRows(page).count();
      expect(rows, "filtered rows on the page").toBe(3);

      // FR-025 says the *currently filtered* entries, so the link has to carry the query it sits under
      // rather than the bare route. A071's link and A073's handler are the two halves of that promise.
      const href = await page.getByRole("link", { name: /export csv/i }).getAttribute("href");
      expect(href ?? "", "export link href").toContain(filters);

      const res = await page.request.get(`${AUDIT.exporter}?${filters}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      // A date a reader recognises as theirs: the viewer's calendar day, the same rule `describeWhen`
      // applies to every timestamp on the page.
      expect(res.headers()["content-disposition"]).toContain(`away-audit-${todayIn(tz)}.csv`);
      expect(res.headers()["x-audit-truncated"]).toBe("false");

      const lines = (await res.text())
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "");
      // Header row plus exactly the rows the list shows. A065 pins the twelve columns and the
      // formula neutralising; this is the one claim that ties the file to the screen.
      expect(lines.length - 1, "csv data rows").toBe(rows);
    } finally {
      await removeEmployee(admin, person);
    }
  });

  for (const who of [SEEDED.employee1, SEEDED.manager]) {
    test(`the ${who.role} is refused the page and the file, and is offered neither`, async ({
      login,
      page,
      browser,
    }) => {
      const admin = adminClient();
      const person = await employeeWithRequest(admin, "refused", `${YEAR}-09-07`, `${YEAR}-09-08`);

      try {
        await login(who);
        await page.goto(AUDIT.page);
        // The guard renders in place: no redirect (the layout's `Forbidden`, not a 302).
        expect(new URL(page.url()).pathname).toBe(AUDIT.page);
        await expect(page.getByRole("alert").filter({ hasText: REFUSAL })).toBeVisible();

        // Neither the nav nor the tab bar offers the page it just refused. Read on the refusal itself,
        // where the layout is still rendered — the same place access.spec.ts reads the nav from.
        await expect(page.getByRole("link", { name: "Audit", exact: true })).toHaveCount(0);

        // The route handler is a separate door, and it has to be locked too (FR-027): it runs without
        // the layout's guard, so a `not_allowed` from `audit_search` is what answers here.
        const refused = await page.request.get(`${AUDIT.exporter}?${query({ person: person.id })}`);
        expect(refused.status()).toBe(403);

        // Control: the same URL, the same rows, for the admin — so a 403 above and a `""` guard cannot
        // both be a route that never worked.
        const adminContext = await browser.newContext();
        const adminPage = await adminContext.newPage();
        await loginAs(adminPage, SEEDED.admin);
        const opened = await adminPage.request.get(`${AUDIT.exporter}?${query({ person: person.id })}`);
        expect(opened.status(), "the admin reaches the same route").toBe(200);
        await adminContext.close();
      } finally {
        await removeEmployee(admin, person);
      }
    });
  }

  test("the admin finds the page in the tab bar, and the tab knows it is open", async ({ login, page }) => {
    await login(SEEDED.admin);
    await page.goto("/admin/users");
    const tab = page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit", exact: true });
    await expect(tab).toHaveCount(1);
    expect(await tab.getAttribute("href")).toBe(AUDIT.page);

    await page.goto(AUDIT.page);
    // `aria-current`, not a colour: FR-028 says the page has to be identifiable without looking.
    await expect(
      page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
});

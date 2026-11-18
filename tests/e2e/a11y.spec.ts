import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { e2ePassword, expect, loginAs, SEEDED, test, type SeededUser } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

/**
 * What each signed-in role can actually reach, so a route cannot leave the audit by being forgotten.
 * `detailFrom` is how a page whose address contains a seeded id gets covered: follow the app's own
 * link rather than hard-code an id no test owns.
 */
type Reachable = { who: SeededUser; paths: string[]; detailFrom?: string };

const REACHABLE: Reachable[] = [
  {
    who: SEEDED.employee1,
    paths: ["/", "/requests", "/requests/new", "/calendar", "/history", "/profile", "/set-password"],
  },
  { who: SEEDED.manager, paths: ["/approvals", "/history"] },
  {
    who: SEEDED.admin,
    paths: ["/admin/users", "/admin/holidays", "/admin/leave-types", "/admin/audit", "/admin/demo", "/history"],
    detailFrom: "/admin/users",
  },
];

async function firstDetailPath(page: Page, from: string): Promise<string> {
  await page.goto(from);
  const href = await page.locator(`a[href^="${from}/"]`).first().getAttribute("href");
  if (!href) throw new Error(`${from} lists no link to a detail page, so the audit would silently skip it.`);
  return href;
}

test("sign-in has no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

// Both schemes, because the tokens resolve to different colours and contrast is a colour question.
for (const scheme of ["light", "dark"] as const) {
  for (const { who, paths, detailFrom } of REACHABLE) {
    test(`${who.role} routes have no serious or critical WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await loginAs(page, who);
      const every = detailFrom ? [...paths, await firstDetailPath(page, detailFrom)] : paths;
      for (const path of every) {
        await page.goto(path);
        // The URL, not just a rendered page: every one of these routes is behind a redirect, and
        // /sign-in has a `main` of its own, so a session that had quietly dropped would audit
        // the sign-in page six times and report the whole app as accessible.
        expect(new URL(page.url()).pathname, `${scheme} ${path}`).toBe(path);
        await expect(page.locator("main"), `${scheme} ${path}`).toBeVisible();
        expect(await serious(page), `${scheme} ${path}`).toEqual([]);
      }
    });
  }
}

test("the /sign-in error states have no violations with the message on the page", async ({ page }) => {
  for (const path of ["/sign-in?error=link", "/sign-in?error=no_profile"]) {
    await page.goto(path);
    // Without this the audit would pass just as happily on a page that had stopped explaining
    // anything. `.alert` rather than the role: Next's route announcer is a role=alert too.
    await expect(page.locator(".alert"), path).toHaveCount(1);
    expect(await serious(page), path).toEqual([]);
  }
});

// Same six-line helper as admin.spec.ts and audit.spec.ts rather than a shared module: moving it
// into fixtures.ts would edit the two files another lane is standing in, for no gain this branch
// needs.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

/**
 * The allowance log is the one table in the app the audit above cannot reach.
 *
 * `AllowanceLog` returns a paragraph while `entries` is empty (`src/components/allowance-log.tsx:20`),
 * and a seeded stack never has entries: `scripts/seed-local.ts` has no allowance code path, and the
 * rows only exist once somebody changes an allowance. So the six-column table — its `.muted` year and
 * "No reason given" cells, which are contrast questions, and its `overflowX: auto` wrapper, which is
 * a keyboard question — has never been analysed on any branch, in either scheme. Every green
 * `admin routes` result above is a green result over an empty state.
 *
 * A throwaway subject rather than a seeded one, because the alternative is to leave an override on a
 * user whose balances other specs assert. What cannot be cleaned up is the two `audit_log` rows,
 * which are append-only by design; `admin.spec.ts` already leaves exactly this residue on every run.
 *
 * The same seeding then answers a second page for the same reason. `/admin/audit` is in the sweep
 * above, where it is unfiltered — so what axe sees is whatever the log happens to hold when that
 * worker gets there, and on a freshly reset stack that is the empty paragraph. Saving an allowance
 * writes a real `allowance_set` entry about this person, so filtering the trail on them cannot be
 * empty, and the populated list — the sentence, the change cells and the instant in the reader's own
 * zone — gets the pass the route list alone cannot promise.
 */
for (const scheme of ["light", "dark"] as const) {
  test(`the populated allowance log and audit list have no serious or critical WCAG 2.1 AA violations (${scheme})`, async ({
    page,
  }) => {
    const admin = adminClient();
    const suffix = randomUUID().slice(0, 6);
    const email = `a11y-allowance-${suffix}@away.test`;
    const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
    if (created.error) throw created.error;
    const id = created.data.user.id;

    try {
      const profile = await admin
        .from("profiles")
        .insert({
          id,
          full_name: `Ada Allowances ${suffix}`,
          email,
          role: "employee",
          region_code: "QLD",
          timezone: "Australia/Brisbane",
        });
      if (profile.error) throw profile.error;

      await page.emulateMedia({ colorScheme: scheme });
      await loginAs(page, SEEDED.admin);
      await page.goto(`/admin/users/${id}`);
      await page.getByLabel("Leave type").selectOption({ index: 0 });
      await page.getByLabel(/^Days in /).fill("7.5");
      // No reason, on purpose: the Reason cell then renders the muted "No reason given" rather than
      // plain text, and the muted string is the one with a contrast answer to give.
      await page.getByRole("button", { name: "Save allowance" }).click();
      await expect(page.getByRole("status")).toHaveText("Allowance saved.");

      await page.reload();
      // The table's presence is the assertion that matters here. Everything before it could pass on
      // a page that had quietly reverted to the paragraph, and then the audit would be measuring the
      // empty state for the sixth time while reporting the populated one as covered.
      const log = page.getByRole("table", { name: "Allowance changes" });
      await expect(log, scheme).toBeVisible();
      await expect(log.getByRole("cell", { name: "7.5" }).first(), scheme).toBeVisible();
      await expect(log.getByRole("cell", { name: "No reason given" }).first(), scheme).toBeVisible();
      expect(await serious(page), `${scheme} populated allowance log`).toEqual([]);

      // The trail for this same person. `person=` is the one filter that cannot be empty here, because
      // the save two lines above is what wrote the row — and it arrives as a filter, so the bar is
      // audited with a value in it rather than at its default, which is the state every link on the
      // page carries and the sweep above never sees.
      await page.goto(`/admin/audit?person=${id}`);
      const trail = page.getByRole("list", { name: "History entries" });
      await expect(trail.getByRole("listitem").first(), `${scheme} audit entry`).toBeVisible();
      expect(await serious(page), `${scheme} populated audit list`).toEqual([]);
    } finally {
      await admin.from("allowance_overrides").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });
}

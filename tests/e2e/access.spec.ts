import type { Page } from "@playwright/test";
import { SEEDED, expect, test, type SeededUser } from "./fixtures";

// src/components/forbidden.tsx does not export its copy, so it is pinned here rather than imported.
// One constant, and the substring is distinctive enough that no other message can satisfy it.
const REFUSAL = "You don't have access to this page";

/** The four admin tab pages; the detail route is listed separately because it needs an id. */
const ADMIN_PAGES = ["/admin/users", "/admin/leave-types", "/admin/holidays", "/admin/demo"];
const ANY_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ALL = [...ADMIN_PAGES, `/admin/users/${ANY_ID}`];

/**
 * The two copies of the role policy, in one place: `reached` is what the page guards allow, and the
 * nav test checks what `src/components/nav.tsx` offers against it.
 */
const MATRIX: { role: string; who: SeededUser; reached: string[]; forbidden: string[] }[] = [
  {
    role: "employee",
    who: SEEDED.employee1,
    reached: ["/requests"],
    // #180's first acceptance criterion, as a route: an employee who opens /reports gets the 403 page.
    forbidden: ["/approvals", "/reports", ...ADMIN_ALL],
  },
  {
    role: "manager",
    who: SEEDED.manager,
    reached: ["/approvals", "/reports"],
    forbidden: ADMIN_ALL,
  },
  {
    role: "admin",
    who: SEEDED.admin,
    reached: [...ADMIN_ALL, "/approvals", "/reports"],
    forbidden: [],
  },
];

/** The hrefs in the navigation the role is actually shown, read from the DOM rather than from a list. */
async function navHrefs(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toHaveCount(1); // the sidebar; the bottom bar is display:none at this width
  return nav
    .getByRole("link")
    .evaluateAll((links) => links.map((l) => (l.getAttribute("href") ?? "").split("?")[0]));
}

async function expectRefused(page: Page, path: string) {
  await page.goto(path);
  // The guard renders in place: no redirect, and the refusal is the page.
  expect(new URL(page.url()).pathname, path).toBe(path);
  await expect(page.getByRole("alert").filter({ hasText: REFUSAL })).toBeVisible();
}

async function expectOpened(page: Page, path: string) {
  await page.goto(path);
  expect(new URL(page.url()).pathname, path).toBe(path);
  await expect(page.getByRole("alert").filter({ hasText: REFUSAL })).toHaveCount(0);
  await expect(page.locator("main")).toBeVisible();
}

for (const { role, who, reached, forbidden } of MATRIX) {
  test(`the ${role} navigation offers only pages the ${role} can open`, async ({ page, login }) => {
    await login(who);
    const hrefs = await navHrefs(page);
    // Guards the loop: an emptied nav would satisfy it by offering nothing.
    expect(hrefs.length, "links offered in the main nav").toBeGreaterThanOrEqual(4);
    for (const href of hrefs) await expectOpened(page, href);
  });

  const refusal = forbidden.length
    ? `the ${role} is refused every page outside the role, and offered none of them`
    : `the admin reaches every page in the app`;

  test(refusal, async ({ page, login }) => {
    await login(who);

    // Positive control first: without it, a page set that stopped guarding anything at all would
    // pass this test by refusing nobody.
    for (const path of reached) await expectOpened(page, path);

    for (const path of forbidden) {
      await expectRefused(page, path);
      // The nav must not offer what the page refuses. Read on the refusal itself, where the nav is
      // still rendered by the layout. "/reports" belongs in this map because it is deliberately *not*
      // in the bar — #423 has an admin's six links already clipping at 360 px, so a seventh is a layout
      // decision and the report is reached from the dashboard's Approvals card instead.
      const label = path === "/approvals" ? "Approvals" : path === "/reports" ? "Reports" : "Admin";
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label })).toHaveCount(0);
    }
  });
}

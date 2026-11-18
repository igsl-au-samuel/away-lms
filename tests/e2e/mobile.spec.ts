import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, loginAs, SEEDED, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// The same eight lines as a11y.spec.ts rather than a shared module: that file is #413's territory
// while it is open, and a one-line import edit there is a conflict for no gain here.
async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

/**
 * #423. `overflow()` above cannot see the bottom bar at any width: the bar is `position: fixed`, so it
 * contributes nothing to the document's scroll height, and a page-level measurement is structurally
 * blind to it. The only way to catch it clipping is to measure the element itself and the right edge of
 * every link inside it.
 *
 * Every role is measured in one pass and reported on whichever line fails, because the numbers for the
 * roles that pass are the input to the layout decision #423 still owes: a passing test prints nothing,
 * and whoever sizes the fix should not have to guess how much headroom a five-link bar has.
 */
const PHONE_WIDTHS = [360, 390];

type BarMeasurement = {
  role: string;
  width: number;
  clientWidth: number;
  scrollWidth: number;
  links: { label: string; right: number }[];
};

/** How much horizontal space the bar's own content demands, from both signals at once. */
function needed(m: BarMeasurement) {
  return Math.max(m.scrollWidth, ...m.links.map((l) => l.right));
}

function barLine(m: BarMeasurement) {
  const rightmost = m.links.reduce((a, b) => (b.right > a.right ? b : a));
  const over = needed(m) - m.clientWidth;
  return (
    `${m.role} @ ${m.width}px: bar box ${m.clientWidth}px, its own scrollWidth ${m.scrollWidth}px, ` +
    `${m.links.length} links, rightmost="${rightmost.label}" ends at x=${rightmost.right} -> ` +
    (over > 0 ? `clips by ${over.toFixed(2)}px` : `fits, ${(-over).toFixed(2)}px spare`)
  );
}

async function measureBar(page: Page, role: string, width: number): Promise<BarMeasurement> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  // `.bottombar`, not `getByRole("navigation", { name: "Main" })`: the sidebar carries the same
  // accessible name, and is only `display: none` at this width rather than absent from the DOM.
  const bar = page.locator(".bottombar");
  await bar.waitFor({ state: "visible" });
  const raw = await bar.evaluate((el) => ({
    innerWidth: window.innerWidth,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    links: Array.from(el.querySelectorAll("a.navlink"), (a) => ({
      label: a.textContent?.trim() ?? "(unlabelled)",
      right: Number(a.getBoundingClientRect().right.toFixed(2)),
    })),
  }));
  if (raw.innerWidth !== width || raw.links.length === 0) {
    throw new Error(`${role} @ ${width}px: the viewport did not apply (${raw.innerWidth}px) or the bar rendered no links (${raw.links.length}).`);
  }
  return { role, width, clientWidth: raw.clientWidth, scrollWidth: raw.scrollWidth, links: raw.links };
}

/**
 * Reach a detail page through the app's own link, so the test owns no id. Throws rather than
 * returning a fallback: a list that stopped linking to its detail pages would otherwise leave the
 * check measuring the list a second time and reporting the detail page as covered.
 */
async function firstDetailPath(page: Page, from: string): Promise<string> {
  await page.goto(from);
  const href = await page.locator(`a[href^="${from}/"]`).first().getAttribute("href");
  if (!href) throw new Error(`${from} lists no link to a detail page, so the check would silently skip it.`);
  return href;
}

test("the request form and the calendar are usable at 390 px with no page-level horizontal scroll", async ({ page }) => {
  await loginAs(page, SEEDED.manager);

  await page.goto("/requests/new");
  await expect(page.getByRole("button", { name: "Submit request" })).toBeVisible();
  expect(await overflow(page), "/requests/new").toBeLessThanOrEqual(0);

  await page.goto("/calendar");
  await expect(page.locator("main")).toBeVisible();
  expect(await overflow(page), "/calendar").toBeLessThanOrEqual(0);

  // Only the two routes a manager can actually see. `/admin/users` and `/admin/demo` used to be in
  // this list, measured as a manager, which measured the Forbidden card instead — see below.
  for (const path of ["/", "/approvals"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

/**
 * The admin pages, signed in as somebody allowed to open them.
 *
 * These two routes sat in the manager's loop above, and admin pages do not redirect a non-admin:
 * `getAdminViewer()` returns null unless the role is admin (`src/server/auth.ts:45`), and both pages
 * `return <Forbidden />` at the same URL while the layout still renders a `main`. So the loop passed by
 * asserting that a three-line error card does not overflow at 390 px, and no real admin page had ever
 * been measured at phone width. Whether a role reaches a route at all is `access.spec.ts`'s job; this
 * file's job is the width of the page the role actually gets.
 */
test("the admin pages are usable at 390 px with no page-level horizontal scroll", async ({ page }) => {
  await loginAs(page, SEEDED.admin);

  for (const { path, heading } of [
    { path: "/admin/users", heading: "Users" },
    { path: "/admin/demo", heading: "Demo data" },
  ]) {
    await page.goto(path);
    expect(new URL(page.url()).pathname, path).toBe(path);
    // The page's own h1 rather than any `main`: Forbidden has an h1 too, at the same address.
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

/**
 * `/admin/users/[id]` is the app's only detail page and had never been rendered at phone width: the
 * test above walks list routes, and this one signs in as an admin because a manager hitting an admin
 * URL gets `<Forbidden />` at the same address — no redirect, and a `main` of its own — so measuring
 * an admin page as a manager measures a three-line error card.
 */
test("the admin user detail page is usable at 390 px with no page-level horizontal scroll", async ({ page }) => {
  await loginAs(page, SEEDED.admin);

  const detail = await firstDetailPath(page, "/admin/users");
  await page.goto(detail);
  expect(new URL(page.url()).pathname, detail).toBe(detail);
  await expect(page.getByRole("heading", { name: /^Allowances for \d{4}$/ }), detail).toBeVisible();
  // The balances grid: five columns of tabular numerals inside an `overflowX: auto` wrapper, which is
  // the app's answer to a wide table on a narrow screen. What this measures is that the wrapper holds
  // the table in instead of pushing the document wider; the table's own scroll is out of reach here.
  await expect(page.getByRole("table", { name: /Leave balances for \d{4}/ }), detail).toBeVisible();
  expect(await overflow(page), detail).toBeLessThanOrEqual(0);
});

/**
 * Axe at phone width, which is not the same question as axe at the default viewport. `Balances` is a
 * five-column table, so at 390 px its wrapper is more likely to be a live scroll region than it ever
 * is on a desktop — and `scrollable-region-focusable` only fires on a region that actually scrolls.
 */
test("the admin user detail page has no serious or critical WCAG 2.1 AA violations at 390 px", async ({ page }) => {
  await loginAs(page, SEEDED.admin);

  const detail = await firstDetailPath(page, "/admin/users");
  await page.goto(detail);
  expect(new URL(page.url()).pathname, detail).toBe(detail);
  await expect(page.getByRole("heading", { name: /^Allowances for \d{4}$/ }), detail).toBeVisible();
  expect(await serious(page), detail).toEqual([]);
});

/**
 * Six links for an admin, five for a manager, four for an employee (`src/components/nav.tsx`), in a bar
 * that is exactly as wide as the screen. #423 measured 370 px of content in a 360 px screen for an
 * admin, and both of its edges — the bar's own `scrollWidth` and the sixth link's right side — sit
 * inside a 390 px screen, which is why every phone test that ran at 390 px said the app was fine.
 * Employee and manager are the control group that proves the check discriminates rather than fires.
 */
test.describe("the fixed bottom bar stays inside the screen at phone widths", () => {
  const measured: BarMeasurement[] = [];

  test.beforeAll(async ({ browser }) => {
    // Three UI sign-ins plus six page loads, which is not a 30-second job on a cold runner.
    test.setTimeout(90_000);
    for (const user of [SEEDED.employee1, SEEDED.manager, SEEDED.admin]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginAs(page, user);
        for (const width of PHONE_WIDTHS) measured.push(await measureBar(page, user.role, width));
      } finally {
        await context.close();
      }
    }
  });

  for (const role of ["employee", "manager", "admin"] as const) {
    test(`the ${role} bottom bar clips no link at 360 px or 390 px`, () => {
      const mine = measured.filter((m) => m.role === role);
      // Without this the test is green when the hook measured nothing at all.
      expect(mine, `${role}: no measurement was taken`).toHaveLength(PHONE_WIDTHS.length);
      expect(
        mine.filter((m) => needed(m) > m.clientWidth).map(barLine),
        `every bar measured this run: ${measured.map(barLine).join(" | ")}`,
      ).toEqual([]);
    });
  }
});

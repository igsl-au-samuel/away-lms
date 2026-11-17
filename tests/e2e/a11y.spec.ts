import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, loginAs, SEEDED, test, type SeededUser } from "./fixtures";

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
    paths: ["/", "/requests", "/requests/new", "/calendar", "/profile", "/set-password"],
  },
  { who: SEEDED.manager, paths: ["/approvals"] },
  {
    who: SEEDED.admin,
    paths: ["/admin/users", "/admin/holidays", "/admin/leave-types", "/admin/demo"],
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

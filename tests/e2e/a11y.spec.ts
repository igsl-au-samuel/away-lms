import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, loginAs, SEEDED, test } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test("sign-in has no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("signed-in pages have no serious or critical WCAG 2.1 AA violations", async ({ page }) => {
  await loginAs(page, SEEDED.manager);
  for (const path of ["/", "/requests/new", "/calendar", "/approvals"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await serious(page), path).toEqual([]);
  }
});

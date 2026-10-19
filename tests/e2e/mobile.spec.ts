import type { Page } from "@playwright/test";
import { expect, loginAs, SEEDED, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the request form and the calendar are usable at 390 px with no page-level horizontal scroll", async ({ page }) => {
  await loginAs(page, SEEDED.manager);

  await page.goto("/requests/new");
  await expect(page.getByRole("button", { name: "Submit request" })).toBeVisible();
  expect(await overflow(page), "/requests/new").toBeLessThanOrEqual(0);

  await page.goto("/calendar");
  await expect(page.locator("main")).toBeVisible();
  expect(await overflow(page), "/calendar").toBeLessThanOrEqual(0);

  for (const path of ["/", "/approvals", "/admin/users", "/admin/demo"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

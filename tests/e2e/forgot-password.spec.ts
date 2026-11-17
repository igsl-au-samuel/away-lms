import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SENT = "If that email has an account, we've sent a link to reset the password.";

/** Submits the form and waits for the reply, so nothing downstream reads a half-rendered page. */
async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: SENT })).toBeVisible();
}

test("the reset confirmation is announced, not only painted", async ({ page }) => {
  await requestReset(page, "nobody@away.test");

  // `role="status"` is what the app gives every other message an action produces (`ResultMessage`
  // in src/components/action-result.tsx). Without it the sentence appears and nothing is
  // announced, so a screen-reader user who just pressed a button hears no reply.
  const notice = page.getByRole("status");
  await expect(notice).toHaveCount(1);
  // The copy itself is pinned, so changing it has to be a decision someone writes down.
  await expect(notice).toHaveText(SENT);
});

test("an address with no account gets the same reply as one that has", async ({ page }) => {
  await requestReset(page, "nobody@away.test");
  const forUnknown = await page.locator("main").innerText();
  // `.alert`, not `getByRole("alert")`: Next's route announcer also carries that role, so a
  // role-based count is never zero (measured in #388).
  await expect(page.locator(".alert")).toHaveCount(0);

  // A seeded account through the same form. `requestPasswordReset` is deliberately always `ok`
  // (src/actions/auth.ts), and this is the assertion that keeps that intent from quietly
  // regressing into user enumeration: the whole rendered reply has to match, not just the notice.
  await requestReset(page, "employee1@away.test");
  expect(await page.locator("main").innerText()).toBe(forUnknown);
  await expect(page.locator(".alert")).toHaveCount(0);
});

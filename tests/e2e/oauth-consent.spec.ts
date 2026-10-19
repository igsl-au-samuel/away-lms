import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  CLAUDE_CALLBACK,
  cleanupOAuthClients,
  cleanupUsers,
  createOAuthClient,
  createTestUser,
  secretClient,
} from "../integration/helpers";
import { e2ePassword, expect, loginAs, SEEDED, test } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

test.afterAll(async () => {
  await cleanupOAuthClients();
  await cleanupUsers();
});

/** Starts an authorization like Claude does and returns the consent path on the app under test. */
async function startAuthorization(clientId: string): Promise<{ consentPath: string; state: string }> {
  const state = randomBytes(8).toString("hex");
  const challenge = createHash("sha256").update(randomBytes(32)).digest("base64url");
  const authorize = new URL(`${supabaseUrl}/auth/v1/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  const res = await fetch(authorize, { redirect: "manual" });
  const location = res.headers.get("Location");
  if (!location) throw new Error(`authorize gave HTTP ${res.status} with no Location`);
  // Local site_url is port 3000; the app under test is on Playwright's baseURL. Keep only path and query.
  const consent = new URL(location);
  expect(consent.pathname).toBe("/oauth/consent");
  return { consentPath: consent.pathname + consent.search, state };
}

/** The client's callback isn't reachable in tests; capture the navigation instead. */
async function captureCallback(page: Page): Promise<() => Promise<URL>> {
  let seen: URL | undefined;
  await page.route(`${new URL(CLAUDE_CALLBACK).origin}/**`, (route) => {
    seen = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>callback</p>" });
  });
  return async () => {
    await expect.poll(() => seen).toBeDefined();
    return seen!;
  };
}

async function signInOnPage(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Next's route announcer is also role=alert, so match ours by its text. */
const alertWith = (page: Page, text: RegExp) => page.getByRole("alert").filter({ hasText: text });

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test("signed out: consent sends you to sign in, then back to consent", async ({ page }) => {
  const { clientId } = await createOAuthClient("Away test connector");
  const { consentPath } = await startAuthorization(clientId);

  await page.goto(consentPath);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await signInOnPage(page, SEEDED.employee1.email, e2ePassword());

  await page.waitForURL((url) => url.pathname === "/oauth/consent");
  await expect(page.getByRole("heading", { name: /Connect Away test connector to Away\?/ })).toBeVisible();
  await expect(page.getByText("claude.ai", { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(SEEDED.employee1.email))).toBeVisible();
  await expect(page.getByText(/read your leave and the team calendar/)).toBeVisible();
});

test("approve lands on the client's redirect URL with a code and the state", async ({ page, login }) => {
  const { clientId } = await createOAuthClient();
  const { consentPath, state } = await startAuthorization(clientId);
  await login(SEEDED.employee1);
  const callback = await captureCallback(page);

  await page.goto(consentPath);
  await page.getByRole("button", { name: "Approve" }).click();

  const url = await callback();
  expect(url.origin + url.pathname).toBe(CLAUDE_CALLBACK);
  expect(url.searchParams.get("code")).toBeTruthy();
  expect(url.searchParams.get("state")).toBe(state);
});

test("deny redirects with error=access_denied", async ({ page, login }) => {
  const { clientId } = await createOAuthClient();
  const { consentPath } = await startAuthorization(clientId);
  await login(SEEDED.employee1);
  const callback = await captureCallback(page);

  await page.goto(consentPath);
  await page.getByRole("button", { name: "Deny" }).click();

  const url = await callback();
  expect(url.searchParams.get("error")).toBe("access_denied");
  expect(url.searchParams.get("code")).toBeNull();
});

test("a bad authorization id shows friendly copy, not a raw error", async ({ page, login }) => {
  await login(SEEDED.employee1);
  await page.goto("/oauth/consent?authorization_id=does-not-exist");
  await expect(alertWith(page, /expired or isn't valid/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/stack|supabase|error:/i);

  await page.goto("/oauth/consent");
  await expect(alertWith(page, /expired or isn't valid/i)).toBeVisible();
});

test("a deactivated user sees 'not active' copy and can't approve", async ({ page }) => {
  const user = await createTestUser("employee");
  await secretClient().from("profiles").update({ is_active: false }).eq("id", user.id);
  const { clientId } = await createOAuthClient();
  const { consentPath } = await startAuthorization(clientId);

  await page.goto(consentPath);
  await signInOnPage(page, user.email, user.password);
  await page.waitForURL((url) => url.pathname === "/oauth/consent");

  await expect(alertWith(page, /account isn't active/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();
});

test("keyboard only: tab to Approve and press Enter", async ({ page, login }) => {
  const { clientId } = await createOAuthClient();
  const { consentPath } = await startAuthorization(clientId);
  await login(SEEDED.employee1);
  const callback = await captureCallback(page);

  await page.goto(consentPath);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Approve" })).toBeFocused();
  await page.keyboard.press("Enter");
  expect((await callback()).searchParams.get("code")).toBeTruthy();
});

for (const scheme of ["light", "dark"] as const) {
  test(`consent page passes axe and fits a phone screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, SEEDED.employee1);
    const { clientId } = await createOAuthClient();
    const { consentPath } = await startAuthorization(clientId);

    await page.goto(consentPath);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.goto("/oauth/consent?authorization_id=does-not-exist");
    await expect(alertWith(page, /expired or isn't valid/i)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
}

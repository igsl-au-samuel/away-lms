import { test as base, expect, type Page } from "@playwright/test";

/** Seeded by `npm run seed:local -- --password <pw>`; the password comes from E2E_PASSWORD. */
export const SEEDED = {
  admin: { email: "admin@away.test", name: "Alex Admin", role: "admin" },
  manager: { email: "manager@away.test", name: "Morgan Manager", role: "manager" },
  employee1: { email: "employee1@away.test", name: "Eden Employee", role: "employee" },
  employee2: { email: "employee2@away.test", name: "Emery Employee", role: "employee" },
} as const;

export type SeededUser = (typeof SEEDED)[keyof typeof SEEDED];

export function e2ePassword(): string {
  const pw = process.env.E2E_PASSWORD;
  if (!pw) throw new Error("E2E_PASSWORD is not set (the password used with `npm run seed:local`).");
  return pw;
}

export async function submitSignIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in through the UI and waits for the landing page. */
export async function loginAs(page: Page, user: SeededUser) {
  await submitSignIn(page, user.email, e2ePassword());
  await page.waitForURL((url) => url.pathname === "/");
}

export const test = base.extend<{ login: (user: SeededUser) => Promise<void> }>({
  login: async ({ page }, use) => {
    await use((user) => loginAs(page, user));
  },
});

export { expect };

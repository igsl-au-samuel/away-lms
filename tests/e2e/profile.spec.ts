import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { todayIn } from "../../src/lib/dates";
import { e2ePassword, expect, loginAs, test } from "./fixtures";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

// 14 hours apart, so the local date differs from the other for most of every day.
const EAST = "Pacific/Kiritimati";
const WEST = "Pacific/Pago_Pago";

test("a user changes region and timezone on /profile, it is saved, and the dashboard date follows", async ({ page }) => {
  const admin = adminClient();
  const email = `profile-${Date.now()}@away.test`;
  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;

  try {
    const profile = await admin
      .from("profiles")
      .insert({ id, full_name: "Pru Profile", email, role: "employee", region_code: "QLD", timezone: EAST });
    if (profile.error) throw profile.error;

    await loginAs(page, { email, name: "Pru Profile", role: "employee" });
    await expect(page.getByText(`Today is`)).toContainText(todayIn(EAST).slice(8, 10));

    await page.getByRole("link", { name: "Profile" }).first().click();
    await page.waitForURL("**/profile");
    await page.getByLabel("Region").selectOption("NSW");
    await page.getByLabel("Timezone").selectOption(WEST);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    await page.reload();
    await expect(page.getByLabel("Region")).toHaveValue("NSW");
    await expect(page.getByLabel("Timezone")).toHaveValue(WEST);

    const saved = await admin.from("profiles").select("region_code, timezone").eq("id", id).single();
    expect(saved.data).toEqual({ region_code: "NSW", timezone: WEST });

    await page.goto("/");
    const westDay = Number(todayIn(WEST).slice(8, 10));
    await expect(page.getByText("Today is")).toContainText(new RegExp(String.raw`\b${westDay}\b`));
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
});

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { todayIn } from "../../src/lib/dates";
import { e2ePassword, expect, SEEDED, test } from "./fixtures";

const YEAR = Number(todayIn("Australia/Brisbane").slice(0, 4));

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

test("the dashboard shows balances that match the hand calculation", async ({ page, login }) => {
  const admin = adminClient();
  const email = `balances-${Date.now()}@away.test`;
  const name = "Bea Balances";

  const created = await admin.auth.admin.createUser({ email, password: e2ePassword(), email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  try {
    const profile = await admin.from("profiles").insert({
      id: userId,
      email,
      full_name: name,
      role: "employee",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    if (profile.error) throw profile.error;

    const types = await admin.from("leave_types").select("id, name").in("name", ["Annual", "Personal/Sick", "Unpaid"]);
    if (types.error) throw types.error;
    const id = (n: string) => types.data.find((t) => t.name === n)!.id;

    // Annual (20): 3 approved + 2 pending       -> 15 available
    // Personal/Sick (10): 11 approved           -> -1 available (over)
    // Unpaid (uncapped): 4 approved, 1.5 pending
    const rows = [
      ["Annual", `${YEAR}-03-02`, `${YEAR}-03-04`, 3, "approved"],
      ["Annual", `${YEAR}-04-06`, `${YEAR}-04-07`, 2, "pending"],
      ["Personal/Sick", `${YEAR}-05-04`, `${YEAR}-05-18`, 11, "approved"],
      ["Unpaid", `${YEAR}-06-01`, `${YEAR}-06-04`, 4, "approved"],
      ["Unpaid", `${YEAR}-07-01`, `${YEAR}-07-01`, 1.5, "pending"],
    ] as const;
    const manager = await admin.from("profiles").select("id").eq("email", SEEDED.manager.email).single();
    if (manager.error) throw manager.error;
    const inserted = await admin.from("leave_requests").insert(
      rows.map(([type, start, end, days, status]) => ({
        user_id: userId,
        leave_type_id: id(type),
        start_date: start,
        end_date: end,
        region_code: "QLD",
        working_days: days,
        status,
        ...(status === "approved" ? { decided_by: manager.data.id, decided_at: new Date().toISOString() } : {}),
      })),
    );
    if (inserted.error) throw inserted.error;

    await login({ email, name, role: "employee" });
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Balances for ${YEAR}` })).toBeVisible();

    const annual = page.getByRole("row", { name: /^Annual/ });
    await expect(annual).toContainText("20 days");
    await expect(annual).toContainText("3 days");
    await expect(annual).toContainText("2 days");
    await expect(annual).toContainText("15 days");

    const sick = page.getByRole("row", { name: /^Personal\/Sick/ });
    await expect(sick).toContainText("−1 day (over)");

    const unpaid = page.getByRole("row", { name: /^Unpaid/ });
    await expect(unpaid).toContainText("4 days");
    await expect(unpaid).toContainText("1.5 days");
    await expect(unpaid).toContainText("No cap");
  } finally {
    await admin.from("leave_requests").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

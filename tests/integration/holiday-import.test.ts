// #181 — the database half of the holiday import, against RLS rather than a stub.
//
// Deliberately no network: `fetchHolidaySource` is proven in tests/unit/holiday-import.test.ts, and
// an integration test that depends on a third-party API answering would be a red CI run nobody
// caused. What is pinned here is the two things the unit stub cannot know:
//
//   1. A non-admin cannot write, because `public_holidays_insert` is `(select private.is_admin())`
//      (supabase/migrations/20261017001200_policies_reference.sql:28). pgTAP row 9 covers the same
//      policy for a bare INSERT; this covers the shape the import actually uses — an UPSERT through
//      PostgREST — so a future change to the grants cannot quietly open the import to a manager.
//   2. A second import of the same year adds nothing and renames nothing, which is the acceptance
//      criterion "existing dates are left alone" stated as a database fact.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { diffHolidays, insertHolidays, type HolidayCandidate } from "../../src/server/holiday-import";
import { anonClient, cleanupUsers, createTestUser, secretClient, signedInClient, type Db } from "./helpers";

/** A year with nothing seeded, so every row here is one this test made. */
const YEAR = 2031;
const ROWS: HolidayCandidate[] = [
  { date: `${YEAR}-05-04`, name: "Labour Day" },
  { date: `${YEAR}-10-05`, name: "King's Birthday" },
];

let admin: Db;
let callers: { name: string; client: Db }[] = [];
const stored = async () => {
  const { data } = await secretClient()
    .from("public_holidays")
    .select("holiday_date, name")
    .eq("region_code", "QLD")
    .gte("holiday_date", `${YEAR}-01-01`)
    .lte("holiday_date", `${YEAR}-12-31`)
    .order("holiday_date");
  return data ?? [];
};

beforeAll(async () => {
  const emp = await createTestUser("employee");
  const mgr = await createTestUser("manager");
  const off = await createTestUser("admin");
  const adm = await createTestUser("admin");
  const offClient = await signedInClient(off.email, off.password);
  // Deactivated after signing in: the session still works, `private.current_role()` says nothing.
  await secretClient().from("profiles").update({ is_active: false }).eq("id", off.id);

  callers = [
    { name: "employee", client: await signedInClient(emp.email, emp.password) },
    { name: "manager", client: await signedInClient(mgr.email, mgr.password) },
    { name: "inactive admin", client: offClient },
  ];
  admin = await signedInClient(adm.email, adm.password);
});

/** Every scenario seeds the dates it needs, so each one starts from an empty year. */
async function clearYear() {
  await secretClient()
    .from("public_holidays")
    .delete()
    .eq("region_code", "QLD")
    .gte("holiday_date", `${YEAR}-01-01`)
    .lte("holiday_date", `${YEAR}-12-31`);
}

beforeEach(clearYear);

afterAll(async () => {
  await clearYear();
  await cleanupUsers();
});

describe("who may write an import", () => {
  it.each(["employee", "manager", "inactive admin"])("refuses the %s, and stores nothing", async (name) => {
    const { client } = callers.find((c) => c.name === name)!;
    const res = await insertHolidays(client, "QLD", ROWS);
    // A refusal is an error from RLS; the empty write-back is the same fact stated the other way.
    if (res.ok) expect(res.data.added).toBe(0);
    else expect(res.error).toBe("not_allowed");
    expect(await stored()).toEqual([]);
  });

  it("refuses an anonymous caller", async () => {
    const res = await insertHolidays(anonClient(), "QLD", ROWS);
    if (res.ok) expect(res.data.added).toBe(0);
    expect(await stored()).toEqual([]);
  });

  it("writes for an admin, and only the dates it was given", async () => {
    const res = await insertHolidays(admin, "QLD", ROWS);
    expect(res).toEqual({ ok: true, data: { added: 2, unchanged: 0 } });
    expect((await stored()).map((r) => r.holiday_date)).toEqual([`${YEAR}-05-04`, `${YEAR}-10-05`]);
  });
});

describe("an import that runs twice", () => {
  it("adds nothing the second time", async () => {
    await insertHolidays(admin, "QLD", ROWS);
    const again = await insertHolidays(admin, "QLD", ROWS);
    expect(again).toEqual({ ok: true, data: { added: 0, unchanged: 2 } });
    expect(await stored()).toHaveLength(2);
  });

  it("leaves a name an admin typed alone, which is what 'existing dates are left alone' means", async () => {
    await insertHolidays(admin, "QLD", ROWS);
    const renamed = await insertHolidays(admin, "QLD", [{ date: `${YEAR}-10-05`, name: "Labour Day (Qld)" }]);
    expect(renamed).toEqual({ ok: true, data: { added: 0, unchanged: 1 } });
    const row = (await stored()).find((r) => r.holiday_date === `${YEAR}-10-05`);
    expect(row?.name).toBe("King's Birthday");
  });

  it("counts only the new dates when some of the year is already stored", async () => {
    await insertHolidays(admin, "QLD", [ROWS[0]]);
    const res = await insertHolidays(admin, "QLD", ROWS);
    expect(res).toEqual({ ok: true, data: { added: 1, unchanged: 1 } });
  });
});

describe("the preview the admin reads before writing", () => {
  it("splits a source list into new, already stored, and dates the source doesn't have", async () => {
    await insertHolidays(admin, "QLD", [ROWS[0], { date: `${YEAR}-08-12`, name: "Royal Queensland Show (Ekka)" }]);
    const res = await diffHolidays(admin, "QLD", YEAR, ROWS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.adding).toEqual([{ date: `${YEAR}-10-05`, name: "King's Birthday" }]);
    expect(res.data.kept).toEqual([{ date: `${YEAR}-05-04`, name: "Labour Day" }]);
    // The Ekka is the measured gap in the source's QLD set. It is stored, the source does not list
    // it, and the preview says so instead of letting an import look like it covered the year.
    expect(res.data.extra).toBe(1);
  });

  it("is readable by an employee, who sees holidays but cannot write them", async () => {
    const { client } = callers.find((c) => c.name === "employee")!;
    const res = await diffHolidays(client, "QLD", YEAR, ROWS);
    expect(res.ok).toBe(true);
  });
});

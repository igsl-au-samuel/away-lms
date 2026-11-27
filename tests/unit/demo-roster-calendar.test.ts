import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { demoRequestDates } from "../../src/server/demo/loader";
import { DEMO_EMPLOYEES, DEMO_REQUESTS } from "../../src/server/demo/roster";

/**
 * The demo roster has to stay off every zero-working-day week, because the loader answers
 * `no_working_days` by retrying the request one week later (`loader.ts`, MAX_SHIFTS), and every
 * retry is another subrequest against the 50 a Worker on the free plan gets. Two rows that did
 * collide — a single QLD Wednesday against the Ekka show day, a NSW Mon–Tue against the 2027
 * Christmas substitutes — are what made the reset's worst case 45 instead of 44 (#448).
 *
 * **Why a unit test reads `supabase/migrations/**`, which looks like a layering violation.**
 * Approved on #448, and it is the load-bearing part of the fix: the seeds, not the code, decide
 * whether a roster date is a working day, and the seeds change every year (ADR 0008). A copy of
 * the holiday table inside this test would drift from the migrations and prove nothing; reading
 * the committed SQL is the only way the guard survives the annual refresh. Whoever adds next
 * year's holidays gets a red test if they create a collision, instead of a demo that silently
 * costs an extra subrequest per load. No database and no `supabase` command is involved — the
 * files are parsed as text.
 *
 * **What a green run does not prove.** The seeds currently stop at 2027. For a load date whose
 * request reaches past the last seeded day, this test cannot judge the week (there are no holiday
 * rows there), so it skips it and says how many it skipped. The retry only *looks* invincible for
 * 2028+ because nothing has measured it; when 2028's holidays are seeded the window grows by
 * itself and those previously-unmeasurable cases start being checked.
 */

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** `public_holidays` as seeded: region code -> the dates that region is closed. */
function readSeeds(): Map<string, Set<string>> {
  const holidays = new Map<string, Set<string>>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!/seed_holidays_.*\.sql$/.test(file)) continue;
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(/\('([A-Z]{2,3})',\s*'(\d{4}-\d{2}-\d{2})'/g)) {
      if (!holidays.has(m[1])) holidays.set(m[1], new Set());
      holidays.get(m[1])!.add(m[2]);
    }
  }
  return holidays;
}

/**
 * Mirrors `private.count_working_days` (migration 20261017001800): weekdays that are not a
 * holiday in the region. A unit test has no database, so the rule is repeated here; if the SQL
 * changes, this has to change with it.
 */
function workingDays(holidays: Map<string, Set<string>>, region: string, start: string, end: string): number {
  let days = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (holidays.get(region)?.has(iso(t))) continue;
    days++;
  }
  return days;
}

const holidays = readSeeds();
const seededDates = [...holidays.values()].flatMap((dates) => [...dates]).sort();
const firstSeeded = seededDates[0];
const lastSeeded = seededDates.at(-1)!;

/** Every day of every year the seeds name, as a possible `today` for the loader. */
const loadDates = (() => {
  const days: string[] = [];
  const from = Date.parse(`${firstSeeded.slice(0, 4)}-01-01T00:00:00Z`);
  const to = Date.parse(`${lastSeeded.slice(0, 4)}-12-31T00:00:00Z`);
  for (let t = from; t <= to; t += DAY_MS) days.push(iso(t));
  return days;
})();

describe("the demo roster's calendar (#448)", () => {
  it(`never lands a roster row on a week with no working days, across ${loadDates.length} load dates (${firstSeeded.slice(0, 4)}–${lastSeeded.slice(0, 4)})`, () => {
    const collisions = new Map<string, { count: number; example: string }>();
    let judged = 0;
    let skipped = 0;

    for (const request of DEMO_REQUESTS) {
      const employee = DEMO_EMPLOYEES.find((e) => e.email === request.email)!;
      for (const today of loadDates) {
        const { start, end } = demoRequestDates(request, today);
        // A range reaching outside the seeded days cannot be judged: the missing days may be
        // holidays. Skipped on purpose, and counted so the skip cannot grow unnoticed.
        if (start < firstSeeded || end > lastSeeded) {
          skipped++;
          continue;
        }
        judged++;
        if (workingDays(holidays, employee.region_code, start, end) === 0) {
          const key = `${employee.email} ${request.leaveType} (weekOffset ${request.weekOffset}, weekday ${request.weekday}, ${request.workdays} day(s))`;
          const seen = collisions.get(key);
          if (seen) seen.count++;
          else collisions.set(key, { count: 1, example: `loaded ${today} -> ${start}..${end}` });
        }
      }
    }

    const rows = [...collisions].map(([row, c]) => `${row}: ${c.count} load dates, e.g. ${c.example}`);
    expect(rows, "roster rows that land on a week with no working days").toEqual([]);
    // The loop has to have actually looked at every roster row on every date it could judge.
    expect(judged + skipped).toBe(DEMO_REQUESTS.length * loadDates.length);
    expect(judged).toBeGreaterThan(skipped);
    if (skipped > 0) {
      // Not a failure: this is the 2028 caveat above, made visible in the run's own output.
      console.log(`${skipped} of ${judged + skipped} checks skipped: the request range reaches past the last seeded day (${lastSeeded}).`);
    }
  });

  it("has holiday rows for every region the roster uses", () => {
    const regions = [...new Set(DEMO_EMPLOYEES.map((e) => e.region_code))].sort();
    expect([...holidays.keys()].sort()).toEqual(expect.arrayContaining(regions));
  });
});
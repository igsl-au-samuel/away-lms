import { todayIn } from "./dates";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type CalendarDay = {
  date: string;
  day: number;
  /** Monday = 0 … Sunday = 6. */
  weekday: number;
  weekdayLabel: string;
  isWeekend: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** A valid `YYYY-MM`, or the fallback. */
export function parseMonth(param: string | null | undefined, fallback: string): string {
  return param && MONTH.test(param) ? param : fallback;
}

/** The viewer's current month (`YYYY-MM`) in their timezone (FR-026). */
export function currentMonth(timeZone: string, now: Date = new Date()): string {
  return todayIn(timeZone, now).slice(0, 7);
}

/** The first and last date of a month and one entry per day. All UTC, so the process timezone is irrelevant. */
export function monthDays(month: string): { from: string; to: string; days: CalendarDay[] } {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const length = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  const days: CalendarDay[] = [];
  for (let day = 1; day <= length; day++) {
    const weekday = (new Date(Date.UTC(year, monthIndex, day)).getUTCDay() + 6) % 7;
    days.push({
      date: `${month}-${pad(day)}`,
      day,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      isWeekend: weekday >= 5,
    });
  }
  return { from: days[0].date, to: days[length - 1].date, days };
}

/** The month `delta` months from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/** Holiday names keyed by region, then by date. */
export function holidaysByRegionDate(
  rows: { region_code: string; holiday_date: string; name: string }[],
): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  for (const h of rows) {
    const byDate = map.get(h.region_code) ?? new Map<string, string>();
    byDate.set(h.holiday_date, h.name);
    map.set(h.region_code, byDate);
  }
  return map;
}

/**
 * People grouped by region, in `regionOrder`, each group sorted by name. Regions with nobody in
 * them are kept so their holidays still show; people in a region missing from the list are
 * appended (sorted by region) rather than dropped.
 */
export function groupByRegion<T extends { full_name: string; region_code: string }>(
  people: T[],
  regionOrder: string[],
): { region: string; people: T[] }[] {
  const byRegion = new Map<string, T[]>(regionOrder.map((r) => [r, []]));
  for (const p of people) {
    const group = byRegion.get(p.region_code) ?? [];
    group.push(p);
    byRegion.set(p.region_code, group);
  }
  const extras = [...byRegion.keys()].filter((r) => !regionOrder.includes(r)).sort();
  return [...regionOrder, ...extras].map((region) => ({
    region,
    people: byRegion.get(region)!.sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));
}

/** A leave span clipped to `[from, to]`, or null when it lies wholly outside. ISO dates compare as strings. */
export function clipSpan(
  start: string,
  end: string,
  from: string,
  to: string,
): { start: string; end: string } | null {
  if (end < from || start > to) return null;
  return { start: start < from ? from : start, end: end > to ? to : end };
}

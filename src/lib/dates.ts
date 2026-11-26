const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const plainFormat = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Format an ISO `YYYY-MM-DD` as `ddd d MMM yyyy`. Never shifts the day. */
export function formatPlainDate(iso: string): string {
  const match = PLAIN_DATE.exec(iso);
  if (!match) throw new Error(`Invalid plain date: ${iso}`);
  const [, y, m, d] = match;
  // Build at UTC midnight and format in UTC so the process timezone is irrelevant.
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return plainFormat.format(date).replace(/,/g, "").replace(/\bSept\b/, "Sep");
}

/** The local calendar date (`YYYY-MM-DD`) of an instant in the given timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The leave year (calendar year) of an instant in the given timezone. */
export function leaveYear(timeZone: string, now: Date = new Date()): number {
  return Number(todayIn(timeZone, now).slice(0, 4));
}

/** "Good morning/afternoon/evening, <first name>" for an instant in the given timezone. */
export function greeting(now: Date, timeZone: string, fullName: string): string {
  const hour =
    Number(new Intl.DateTimeFormat("en-AU", { timeZone, hour: "numeric", hour12: false }).format(now)) % 24;
  const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = fullName.trim().split(/\s+/)[0];
  return firstName ? `${salutation}, ${firstName}` : salutation;
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from one `YYYY-MM-DD` to another, negative when `to` is behind `from`.
 *
 * Both operands go through UTC midnight, which is what makes the count a day count rather than an instant
 * difference: a span measured across a daylight-saving day is 23 or 25 hours long, and dividing that by
 * 86 400 000 rounds to the wrong label. `todayIn()` above produces the same shape of string, so the viewer's
 * zone is resolved before this function is ever called.
 */
function daysBetween(from: string, to: string): number {
  const dayNumber = (iso: string) => {
    const match = PLAIN_DATE.exec(iso);
    if (!match) throw new Error(`Invalid plain date: ${iso}`);
    const [, y, m, d] = match;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  };
  return Math.round((dayNumber(to) - dayNumber(from)) / MS_PER_DAY);
}

/**
 * The countdown a dashboard row shows beside one upcoming leave, or `null` when it has nothing to count
 * down to because the range is already behind today.
 *
 * The order is the copy: the `> 1` arm is what makes `In 1 days` unreachable, since the gap of one is
 * spelled `Tomorrow`, and a leave that has begun is described by where it is (`In progress`) rather than by
 * a number the reader has to subtract. `null` is not a state the dashboard can reach — its query keeps only
 * rows with `end_date >= today` — but a range that has finished has no honest countdown in this set of four,
 * and the caller renders nothing for it instead of inventing a fifth label.
 */
export function daysUntilLabel(startDate: string, endDate: string, today: string): string | null {
  const untilStart = daysBetween(today, startDate);
  if (untilStart > 1) return `In ${untilStart} days`;
  if (untilStart === 1) return "Tomorrow";
  if (untilStart === 0) return "Starts today";
  return daysBetween(today, endDate) >= 0 ? "In progress" : null;
}

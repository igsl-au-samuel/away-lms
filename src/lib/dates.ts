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

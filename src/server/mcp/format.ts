import { formatPlainDate } from "../../lib/dates";

/** `1 day`, `2.5 days`. */
export function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** `Mon 7 Sep 2026` or `Mon 7 Sep 2026 – Fri 11 Sep 2026`. */
export function dateRange(start: string, end: string): string {
  return start === end ? formatPlainDate(start) : `${formatPlainDate(start)} – ${formatPlainDate(end)}`;
}

/** Bulleted list, or the fallback line when there is nothing to list. */
export function bullets(lines: string[], empty: string): string {
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : empty;
}

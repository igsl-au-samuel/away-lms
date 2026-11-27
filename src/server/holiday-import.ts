// #181 — load a region's public holidays for one year from a free source instead of typing them.
//
// The source is **Nager.Date** (`https://date.nager.at`, repository `nager/Nager.Date`, MIT, no key
// and no account — measured and recorded on #181 on 2026-11-27). Its AU rows carry a `counties`
// list, which is what makes QLD and NSW separable; the OpenHolidays API is keyless too but serves
// neither AU nor HK, and every keyed alternative is out on Constitution I.
//
// Coverage is not complete, and the preview is what makes that safe rather than a silent loss: for
// 2026 the source agrees with every seeded HK date, and for the two Australian states it is missing
// `2026-08-12` Royal Queensland Show and `2026-08-03` NSW Bank Holiday — days the source treats as
// local or leaves out altogether. So the write is **additive only**: `diffHolidays` decides what is
// new, `insertHolidays` uses `ON CONFLICT DO NOTHING` through the table's own
// `unique (region_code, holiday_date)` key, and a date already in the table keeps the name someone
// typed for it. Nothing here can update or delete a holiday.
//
// Three things shape the split of these functions:
// - No `import "server-only"`, for the reason `src/server/reports.ts` gives: the unit test imports
//   this module and the guard throws in a node test worker. Every function takes the client.
// - The network half (`fetchHolidaySource`) is apart from the database halves (`diffHolidays`,
//   `insertHolidays`) so the integration test can pin refusal and idempotency without a third-party
//   API having to answer for it.
// - The import action re-fetches rather than taking the previewed rows from the browser. An admin
//   could already type any of these dates by hand, so a tampered list would grant nothing — but
//   re-fetching means what lands is what the source says, and the only thing crossing the boundary
//   is a region code and a year.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../lib/database.types";

type Db = SupabaseClient<Database>;

/** One holiday as the app stores it: a date and a name, for the region being imported into. */
export type HolidayCandidate = { date: string; name: string };

export const HOLIDAY_SOURCE = {
  name: "Nager.Date",
  site: "https://date.nager.at",
  endpoint: "https://date.nager.at/api/v3/PublicHolidays",
  licence: "MIT",
  licenceUrl: "https://github.com/nager/Nager.Date/blob/master/LICENSE",
} as const;

/** What the screen cites next to the preview, so the provenance is on the page and not only in code. */
export type HolidaySource = typeof HOLIDAY_SOURCE;

/**
 * Which rows of the source belong to which region. Region codes are whatever an admin types, so
 * this is the app's own mapping rather than data the source can be asked about — and a region that
 * isn't in it simply has no import offered, and keeps the manual form it already has. Adding a
 * state is one line here, not a migration.
 */
export const IMPORTABLE_REGIONS: Record<string, { countryCode: string; subdivision?: string }> = {
  QLD: { countryCode: "AU", subdivision: "QLD" },
  NSW: { countryCode: "AU", subdivision: "NSW" },
  HK: { countryCode: "HK" },
};

/** The years the source answers for, measured 1990 through 2050 on 2026-11-27. */
export const IMPORT_YEARS = { min: 1990, max: 2050 } as const;

export type ImportErrorCode =
  | "region_unsupported"
  | "year_unsupported"
  | "source_unavailable"
  | "source_unexpected"
  | "read_failed"
  | "not_allowed"
  | "write_failed";

export type ImportResult<T> = { ok: true; data: T } | { ok: false; error: ImportErrorCode };

/** What the admin sees before anything is written, and what the write is measured against. */
export type HolidayPreview = {
  region: string;
  year: number;
  source: typeof HOLIDAY_SOURCE;
  /** New dates, in the order they will be written. */
  adding: HolidayCandidate[];
  /** Dates the source and the table already agree on. */
  kept: HolidayCandidate[];
  /** Rows stored for that region and year which the source does not list — left untouched. */
  extra: number;
};

export type HolidayImportOutcome = { added: number; unchanged: number };

const sourceDate = z.iso.date();

/** `2026-13-45` is the shape of a date, not a date; Postgres would reject it and take the whole
 * insert with it, so a row that doesn't round-trip through the date parser is dropped here. */
function isRealDate(value: string, year: number): boolean {
  return value.startsWith(`${year}-`) && sourceDate.safeParse(value).success;
}

/** The source's names reach a `check (char_length(name) between 1 and 80)`. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return text.length > 0 ? text : null;
}

/**
 * The pure half: a source payload in, the rows for one region and year out.
 *
 * Returns null when the body isn't a list at all, which is a different fact from "the list was
 * empty" and has to stay distinguishable — an empty import that reads as success is how a region
 * ends up with no holidays and an admin who believes it has them.
 */
export function selectSourceRows(payload: unknown, region: string, year: number): HolidayCandidate[] | null {
  if (!Array.isArray(payload)) return null;
  const scope = IMPORTABLE_REGIONS[region];
  if (!scope) return [];

  const seen: (HolidayCandidate & { specific: boolean })[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const entry = row as { date?: unknown; name?: unknown; localName?: unknown; global?: unknown; counties?: unknown };
    if (typeof entry.date !== "string" || !isRealDate(entry.date, year)) continue;
    const counties = Array.isArray(entry.counties) ? entry.counties.filter((c): c is string => typeof c === "string") : [];
    // A country-wide scope takes every row; a state takes the national rows plus the rows that
    // name it. `global: false, counties: []` is a day some *other* state observes, so it drops out.
    if (scope.subdivision && !counties.includes(`${scope.countryCode}-${scope.subdivision}`) && entry.global !== true) continue;
    const name = cleanName(entry.name) ?? cleanName(entry.localName);
    if (!name) continue;
    seen.push({ date: entry.date, name, specific: counties.length > 0 });
  }

  // Two rows can share a date — the national one and the state's own. The state names the day the
  // way its people call it, so it wins the tie.
  const byDate = new Map<string, HolidayCandidate & { specific: boolean }>();
  for (const row of seen) {
    const held = byDate.get(row.date);
    if (!held || (row.specific && !held.specific)) byDate.set(row.date, row);
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(({ date, name }) => ({ date, name }));
}

/** Reads one region's year from the source. Never throws: a source that is down is a message. */
export async function fetchHolidaySource(
  region: string,
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult<HolidayCandidate[]>> {
  if (!IMPORTABLE_REGIONS[region]) return { ok: false, error: "region_unsupported" };
  if (year < IMPORT_YEARS.min || year > IMPORT_YEARS.max) return { ok: false, error: "year_unsupported" };
  const scope = IMPORTABLE_REGIONS[region]!;
  let response: Response;
  try {
    response = await fetchImpl(`${HOLIDAY_SOURCE.endpoint}/${year}/${scope.countryCode}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "source_unavailable" };
  }
  if (!response.ok) return { ok: false, error: "source_unavailable" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "source_unexpected" };
  }
  const rows = selectSourceRows(payload, region, year);
  if (!rows || rows.length === 0) return { ok: false, error: "source_unexpected" };
  return { ok: true, data: rows };
}

/** Splits the source's rows into new, already stored, and stored-but-not-in-the-source. */
export async function diffHolidays(
  db: Db,
  region: string,
  year: number,
  rows: HolidayCandidate[],
): Promise<ImportResult<{ adding: HolidayCandidate[]; kept: HolidayCandidate[]; extra: number }>> {
  const res = await db
    .from("public_holidays")
    .select("holiday_date")
    .eq("region_code", region)
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`);
  if (res.error) return { ok: false, error: "read_failed" };
  const stored = new Set((res.data ?? []).map((r) => r.holiday_date));
  const adding: HolidayCandidate[] = [];
  const kept: HolidayCandidate[] = [];
  for (const row of rows) (stored.has(row.date) ? kept : adding).push(row);
  return { ok: true, data: { adding, kept, extra: stored.size - kept.length } };
}

/**
 * Writes the new dates and only those. `ignoreDuplicates` turns the unique key into the idempotency
 * rule, so a second import of the same year adds nothing and a date someone named by hand keeps
 * their name; RLS answers 42501 for anyone who is not an admin, whatever the caller believes.
 */
export async function insertHolidays(db: Db, region: string, rows: HolidayCandidate[]): Promise<ImportResult<HolidayImportOutcome>> {
  if (rows.length === 0) return { ok: true, data: { added: 0, unchanged: 0 } };
  const res = await db
    .from("public_holidays")
    .upsert(rows.map((r) => ({ region_code: region, holiday_date: r.date, name: r.name })), {
      onConflict: "region_code,holiday_date",
      ignoreDuplicates: true,
    })
    .select("id");
  if (res.error) return { ok: false, error: res.error.code === "42501" ? "not_allowed" : "write_failed" };
  const added = (res.data ?? []).length;
  return { ok: true, data: { added, unchanged: rows.length - added } };
}

/** Preview: fetch, then diff. Writes nothing — that is the whole point of it. */
export async function previewImport(
  db: Db,
  region: string,
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult<HolidayPreview>> {
  const fetched = await fetchHolidaySource(region, year, fetchImpl);
  if (!fetched.ok) return fetched;
  const diff = await diffHolidays(db, region, year, fetched.data);
  if (!diff.ok) return diff;
  return {
    ok: true,
    data: {
      region,
      year,
      source: HOLIDAY_SOURCE,
      adding: diff.data.adding,
      kept: diff.data.kept,
      extra: diff.data.extra,
    },
  };
}

/** The write, measured against what the source says now rather than what the preview showed. */
export async function applyImport(
  db: Db,
  region: string,
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportResult<HolidayImportOutcome>> {
  const fetched = await fetchHolidaySource(region, year, fetchImpl);
  if (!fetched.ok) return fetched;
  const diff = await diffHolidays(db, region, year, fetched.data);
  if (!diff.ok) return diff;
  return insertHolidays(db, region, diff.data.adding);
}

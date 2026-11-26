// #180 — the utilisation report: one read, one file, and the year the URL asked for.
//
// Deliberately shaped like `src/server/audit.ts` rather than invented fresh: the same wrapper style
// (take the client, return `{ rows, error }`, never throw at the page), the same CSV contract (the
// database renders the file, so the file cannot disagree with the read), and the same refusal the
// export route gives an unreadable filter.
//
// No `import "server-only"` here either, for the reason audit.ts gives: the unit test imports this
// module, and the guard throws in a node test worker. Every function takes the client rather than
// calling `createClient()`, which is what keeps that test possible.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../lib/database.types";

type Db = SupabaseClient<Database>;

/** One person's use of one leave type in one year. `allowance` and `available` are null for an
 * uncapped type — the database answers null rather than zero precisely so the page can say "No cap"
 * instead of asserting a budget nobody set. */
export type ReportRow = {
  person_id: string;
  person_name: string;
  leave_type_id: string;
  leave_type_name: string;
  is_capped: boolean;
  allowance: number | null;
  taken: number;
  pending: number;
  available: number | null;
  is_demo: boolean;
};

export type ReportResult = { rows: ReportRow[]; error: PostgrestError | null };
export type ReportExport = { csv: string; rowCount: number; error: PostgrestError | null };

/** Four digits, nothing else. The parameter reaches a `smallint`, and the difference between refusing
 * `20o6` and coercing it is the difference between telling the reader the year changed and letting them
 * believe the numbers are for the year they typed. */
const Year = z.string().regex(/^\d{4}$/).transform(Number);

/**
 * The year to show. `null` means the URL carried something that is not a year, which is a fact the page
 * has to say out loud: a report whose heading names a different year from the one asked for is only
 * wrong to the person who knows what they typed.
 */
export function parseYear(raw: string | null | undefined): { year: number | null } {
  const parsed = Year.safeParse(raw ?? undefined);
  return { year: parsed.success ? parsed.data : null };
}

/** The report itself: every profile, every leave type that is active or holds a counted request. */
export async function fetchReport(c: Db, year: number): Promise<ReportResult> {
  const res = await c.rpc("leave_report", { p_year: year });
  if (res.error) return { rows: [], error: res.error };
  return { rows: (res.data ?? []) as ReportRow[], error: null };
}

/** The same rows as a file, rendered in SQL by the same helper the read calls. */
export async function exportReportCsv(c: Db, year: number): Promise<ReportExport> {
  const res = await c.rpc("leave_report_csv", { p_year: year });
  const row = (res.data ?? [])[0];
  if (res.error || row === undefined) return { csv: "", rowCount: 0, error: res.error ?? null };
  return { csv: row.csv, rowCount: row.row_count, error: null };
}

/**
 * Rows grouped by person, in the order the database returned them. The table needs this so a person's
 * name is said once beside the types they have, which is the difference between a report and a list of
 * numbers; it is a pure function here rather than inline in the page so the unit test can see it.
 */
export function groupByPerson(rows: ReportRow[]): { personId: string; personName: string; isDemo: boolean; rows: ReportRow[] }[] {
  const groups: { personId: string; personName: string; isDemo: boolean; rows: ReportRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.personId === row.person_id) last.rows.push(row);
    else groups.push({ personId: row.person_id, personName: row.person_name, isDemo: row.is_demo, rows: [row] });
  }
  return groups;
}

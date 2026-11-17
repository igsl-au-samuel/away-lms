// No `import "server-only"` here, unlike the other src/server modules: A037's unit test
// imports this file to pin the mapper, and the guard throws in a node test worker.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllowanceLogEntry } from "../components/allowance-log";
import type { Database } from "../lib/database.types";

type Db = SupabaseClient<Database>;

/** What one `audit_log` row looks like to this reader. `before`, `after` and `context` are
 * jsonb, so PostgREST hands back objects holding real numbers rather than the text `->>`
 * would give. */
export type AllowanceAuditRow = {
  id: number;
  action: string;
  actor_name: string | null;
  created_at: string;
  comment: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

/** An entry plus the person it is about, because `approvals` groups the log by requester and
 * a default change has no subject at all. The component reads the eight entry keys and
 * ignores this one. */
export type AllowanceLogRow = AllowanceLogEntry & { subject_id: string | null };

const ACTIONS = ["allowance_set", "allowance_removed", "leave_type_default_changed"] as const;

// A default change is about the leave type, so its pair is default_allowance; an override's
// pair is days, and allowance_removed carries days with a null value rather than dropping the
// key (20261116062030_audit_triggers.sql:211-225).
const daysKey = (action: string) => (action === "leave_type_default_changed" ? "default_allowance" : "days");

const asNumber = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

const asString = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// PostgREST hands a jsonb column back as `Json`, which may be any json value. These three
// columns are always objects when they are set, so anything else is read as absent rather
// than guessed at.
const asObject = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function toAllowanceLogEntry(row: AllowanceAuditRow): AllowanceLogEntry {
  const key = daysKey(row.action);
  return {
    id: row.id,
    leave_type: asString(row.context?.leave_type_name) ?? "Unknown",
    year: asNumber(row.context?.year),
    old_days: asNumber(row.before?.[key]),
    new_days: asNumber(row.after?.[key]),
    changed_by: row.actor_name ?? "Unknown",
    changed_at: row.created_at,
    reason: row.comment,
  };
}

/** The allowance history, read from `audit_log`.
 *
 * `subjectIds` narrows it to those people; `includeDefaults` adds the leave-type default
 * changes, which belong to everybody and have no subject. The row-level policy
 * (`private.can_view_audit`) decides what the caller can actually see, so a subject id the
 * caller may not read simply returns nothing rather than an error.
 *
 * Two queries, not one filter string: `or(subject_id.in.a,b,subject_id.is.null)` would have to
 * interpolate ids into PostgREST's filter syntax, and a comma in a value would change the
 * filter's meaning rather than fail.
 */
export async function readAllowanceLog(
  c: Db,
  opts: { subjectIds?: readonly string[]; includeDefaults?: boolean; limit?: number } = {},
): Promise<AllowanceLogRow[]> {
  const select = "id, action, actor_name, created_at, comment, before, after, context, subject_id";
  const subjectIds = [...new Set(opts.subjectIds ?? [])];

  const rows: AllowanceLogRow[] = [];

  if (subjectIds.length > 0) {
    const res = await c
      .from("audit_log")
      .select(select)
      .in("action", [...ACTIONS])
      .in("subject_id", subjectIds)
      .order("created_at", { ascending: false });
    for (const r of res.data ?? []) rows.push(toRow(r));
  }

  if (opts.includeDefaults) {
    const res = await c
      .from("audit_log")
      .select(select)
      .eq("action", "leave_type_default_changed")
      .is("subject_id", null)
      .order("created_at", { ascending: false });
    for (const r of res.data ?? []) rows.push(toRow(r));
  }

  // Both halves arrive newest-first; merged they need sorting again, and only then
  // truncating: limiting each query separately would cut one half of the history rather than
  // the oldest entries. With no limit there is none, because the approvals queue reads every
  // entry for its requesters and caps them per person itself.
  rows.sort((a, b) => (a.changed_at < b.changed_at ? 1 : a.changed_at > b.changed_at ? -1 : b.id - a.id));
  return opts.limit === undefined ? rows : rows.slice(0, opts.limit);
}

const toRow = (r: Omit<AllowanceAuditRow, "before" | "after" | "context"> & {
  before: unknown;
  after: unknown;
  context: unknown;
  subject_id: string | null;
}): AllowanceLogRow => ({
  ...toAllowanceLogEntry({
    ...r,
    before: asObject(r.before),
    after: asObject(r.after),
    context: asObject(r.context),
  }),
  subject_id: r.subject_id,
});

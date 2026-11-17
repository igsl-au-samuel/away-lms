// The words a history row is read as: one sentence, one before/after summary, one instant and a
// list of labels. A053 pinned all four in tests/unit/audit.test.ts before this file existed, so
// the wording there is the contract and this is the answer to it.
//
// No `import "server-only"` here, unlike the other src/server modules, for the same reason
// `allowance-log.ts` gives: A053's unit test imports this file, and the guard throws in a node
// test worker. It is also why `fetchMyHistory` takes the client instead of making one — pulling in
// `next/headers` would put a server-only module in the path of a test that never renders a page.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { formatPlainDate } from "../lib/dates";
import type { Database } from "../lib/database.types";

type Db = SupabaseClient<Database>;

/**
 * One `audit_log` row as this module reads it. The keys are the generated Row's, with two
 * differences and both are load-bearing: the jsonb three are objects rather than `Json`, because
 * PostgREST hands back parsed json and a reader should not have to prove that to the compiler at
 * every field; and `actor_role` is spelled out instead of naming the enum, so a row is not
 * re-typed here every time the enum changes.
 */
export type AuditEntry = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  subject_id: string | null;
  subject_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  comment: string | null;
  is_demo: boolean;
  is_backfilled: boolean;
  source_key: string | null;
};

const asString = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const asNumber = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

const asObject = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** `Alex Employee's`, or `their own` when the row is a person acting on themselves — the one case
 * where naming the same person twice in one sentence reads like a mistake. */
function possessive(entry: AuditEntry): string {
  if (entry.actor_id !== null && entry.actor_id === entry.subject_id) return "their own";
  return `${entry.subject_name ?? "the affected person"}'s`;
}

/** ` for Annual leave`, or nothing at all. FR-013: a deleted leave type leaves `leave_type_name`
 * null, and "request for , 3 Mar" reads worse than the sentence with the type phrase absent. */
const typePhrase = (name: string | null) => (name === null ? "" : ` for ${name}`);

/** `, Tue 3 Mar 2026 – Sat 7 Mar 2026` — one date when the request is a single day, nothing when
 * the action carries no dates. The en dash is between the dates, never inside a word. */
function rangeClause(context: Record<string, unknown> | null): string {
  const start = asString(context?.start_date);
  if (start === null) return "";
  const end = asString(context?.end_date);
  if (end === null || start === end) return `, ${formatPlainDate(start)}`;
  return `, ${formatPlainDate(start)} – ${formatPlainDate(end)}`;
}

/** The comment, in words and in quotation marks. Returned as plain text and deliberately not
 * escaped: React escapes on render, so pre-escaping here would put `&lt;script&gt;` on the screen.
 * No comment — stored as null, or as the empty string the triggers turn into null — adds nothing,
 * including the em dash it would otherwise hang from. */
const commentClause = (comment: string | null) =>
  comment === null || comment === "" ? "" : ` — "${comment}"`;

/**
 * One plain-language sentence for the row (FR-023): who, what verb, whose, which type, which
 * dates. It carries no number on purpose — the days and the before/after values are
 * `describeChange`'s column, and repeating them would put one figure twice in the same row. Nor
 * does it carry Demo or System: those are labels, and `describeLabels` owns them.
 */
export function describeEntry(entry: AuditEntry): string {
  const actor = entry.actor_name;
  const context = entry.context;
  const typeName = asString(context?.leave_type_name);
  const range = rangeClause(context);
  const who = possessive(entry);

  let body: string;
  switch (entry.action) {
    case "request_submitted": {
      // The requester is always the subject — `audit_requests` writes `new.user_id` there and the
      // session that ran the insert as the actor. A service-role, MCP or backfilled insert has no
      // actor, so the row says `System`, and naming the plumbing would hide the one person the
      // reader is looking for (FR-023). With a signed-in actor their own name still leads, which is
      // the sentence A053 pinned.
      const requester = entry.actor_id === null ? (entry.subject_name ?? actor) : actor;
      body = `${requester} submitted a request${typePhrase(typeName)}${range}`;
      break;
    }
    case "request_approved":
    case "request_declined":
      body = `${actor} ${entry.action === "request_approved" ? "approved" : "declined"} ${who} request${typePhrase(typeName)}${range}`;
      break;
    case "allowance_set":
    case "allowance_removed": {
      const year = asNumber(context?.year);
      body = `${actor} ${entry.action === "allowance_set" ? "set" : "removed"} ${who} ${
        typeName === null ? "allowance" : `${typeName} allowance`
      }${year === null ? "" : ` for ${year}`}`;
      break;
    }
    case "user_created":
      body = `${actor} created ${who} account`;
      break;
    case "user_role_changed":
      body = `${actor} changed ${who} role`;
      break;
    case "user_region_changed":
      body = `${actor} changed ${who} region`;
      break;
    case "user_active_changed":
      body = `${actor} changed ${who} active status`;
      break;
    case "leave_type_default_changed":
      body = `${actor} changed the ${typeName ?? "leave type"} default`;
      break;
    case "leave_type_changed":
      body = `${actor} changed the ${typeName ?? "leave type"} settings`;
      break;
    // `audit_log_action_known` (20261116062030_audit_triggers.sql) is a check constraint, so a
    // row can only hold one of the eleven above. This arm is for the shape of the type, and for
    // the day the constraint and this switch are edited apart.
    default:
      body = `${actor} changed ${entry.entity.replace(/_/g, " ")}`;
  }
  return `${body}${commentClause(entry.comment)}.`;
}

// The fields a reader cares about, in that order. jsonb stores keys sorted by length, so the order
// they arrive in is a storage detail: without this list `user_created` would read
// "active, region, role", which A053's fixture says it must not. A field the triggers start
// writing later lands after these rather than being dropped.
const FIELD_ORDER = [
  "role",
  "region_code",
  "is_active",
  "status",
  "days",
  "default_allowance",
  "is_capped",
  "name",
  "sort_order",
] as const;

const FIELD_WORDS: Record<string, string> = {
  role: "role",
  region_code: "region",
  is_active: "active",
  status: "status",
  days: "days",
  default_allowance: "default allowance",
  is_capped: "capped",
  name: "name",
  sort_order: "order",
};

const fieldWord = (key: string) => FIELD_WORDS[key] ?? key.replace(/_/g, " ");

// Booleans as no and yes: a reader is working out what happened, not reading a column type.
const valueWord = (v: unknown): string => (v === true ? "yes" : v === false ? "no" : String(v));

/**
 * The before/after summary (FR-007, FR-025): `field: old → new`, one part per field that actually
 * moved, joined with a semicolon because one save can write a single entry for three fields. A
 * field whose value is the same on both sides is left out — that a type stayed capped is not a
 * change. With no before there is no arrow, because nothing was replaced.
 */
export function describeChange(entry: AuditEntry): string {
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  const ordered = [...FIELD_ORDER.filter((k) => keys.includes(k as string)), ...keys.filter((k) => !(FIELD_ORDER as readonly string[]).includes(k))];

  const parts: string[] = [];
  for (const key of ordered) {
    const old = entry.before?.[key];
    const now = entry.after?.[key];
    if (old === now) continue;
    if (old === undefined) {
      parts.push(`${fieldWord(key)}: ${valueWord(now)}`);
    } else if (now === undefined || now === null) {
      // A removal says what applies in its place, because "none" alone reads like a gap.
      const suffix = entry.action === "allowance_removed" ? " (the default now applies)" : "";
      parts.push(`${fieldWord(key)}: ${valueWord(old)} → none${suffix}`);
    } else {
      parts.push(`${fieldWord(key)}: ${valueWord(old)} → ${valueWord(now)}`);
    }
  }
  return parts.join("; ");
}

/**
 * The instant in the viewer's zone rather than the server's (FR-025). A Brisbane reader and a
 * Perth reader are meant to get different text from one row: `created_at` is an instant, and which
 * day it fell on depends on where the reader is standing. `hour12: false` keeps the clock at
 * `01:30` instead of `1:30 am`, so a column of times lines up.
 */
export function describeWhen(entry: AuditEntry, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(entry.created_at));
}

/**
 * `System`, `Demo`, `Backfilled` as words (FR-019, FR-028) — never colour alone, so what a row
 * carries is in this list rather than in a style.
 *
 * `System` follows `actor_id` and not `actor_name`: the label means "no signed-in person made this
 * change" (FR-009), and a profile called "System" is somebody's name. The database decides that
 * word — `private.audit_actor()` writes it when `auth.uid()` is null — and this only reports the
 * null id the same row already carries.
 */
export function describeLabels(entry: AuditEntry): string[] {
  const labels: string[] = [];
  if (entry.actor_id === null) labels.push("System");
  if (entry.is_demo) labels.push("Demo");
  if (entry.is_backfilled) labels.push("Backfilled");
  return labels;
}

/** The cursor a page hands back: the last row it showed, as the function's own two columns. */
export type HistoryCursor = { beforeAt?: string | null; beforeId?: number | null; limit?: number };

/**
 * `error` beside the entries, the way `readAllowanceLog` carries it: an empty list must not read as
 * "no history yet" when the read actually failed. Only `entries: []` with `error: null` may show
 * the empty state.
 */
export type HistoryResult = { entries: AuditEntry[]; error: PostgrestError | null };

/**
 * One page of the caller's own trail, in one database call (A056).
 *
 * `audit_my_history` is `security invoker`, so everything here was already selectable by this
 * session: the function narrows an admin's read and pages it, and the row-level policy decides the
 * rest. An inactive caller gets no rows; a caller who may not execute the function gets `42501` in
 * `error`, which is exactly why the result carries one. A half cursor is left out of the call
 * rather than sent as null, which is the same rule A055 states in SQL: no cursor, newest page.
 */
export async function fetchMyHistory(c: Db, cursor: HistoryCursor = {}): Promise<HistoryResult> {
  const res = await c.rpc("audit_my_history", {
    p_before_at: cursor.beforeAt ?? undefined,
    p_before_id: cursor.beforeId ?? undefined,
    p_limit: cursor.limit ?? 50,
  });
  if (res.error) return { entries: [], error: res.error };
  return {
    entries: (res.data ?? []).map((r) => ({
      ...r,
      before: asObject(r.before),
      after: asObject(r.after),
      context: asObject(r.context),
    })),
    error: null,
  };
}

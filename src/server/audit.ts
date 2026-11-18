// The words a history row is read as: one sentence, one before/after summary, one instant and a
// list of labels. A053 pinned all four in tests/unit/audit.test.ts before this file existed, so
// the wording there is the contract and this is the answer to it.
//
// No `import "server-only"` here, unlike the other src/server modules, for the same reason
// `allowance-log.ts` gives: A053's unit test imports this file, and the guard throws in a node
// test worker. It is also why `fetchMyHistory` takes the client instead of making one — pulling in
// `next/headers` would put a server-only module in the path of a test that never renders a page.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
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
  return { entries: (res.data ?? []).map(toEntry), error: null };
}

/** One `audit_log` row as PostgREST describes it — which is the same 17 keys as `AuditEntry` except
 * that the jsonb three are `Json`, because the schema only knows that column is json. */
type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

/** The jsonb three as objects, which is what `describeChange` and `describeEntry` read. PostgREST
 * hands back parsed json, but the generated `Row` calls those columns `Json`, so the widening
 * happens here once rather than at every reader of every page. */
function toEntry(r: AuditRow): AuditEntry {
  return { ...r, before: asObject(r.before), after: asObject(r.after), context: asObject(r.context) };
}

// ---- A070: the Audit page's filters, and the two reads that use them -------------------------
//
// One schema, seven filter params and a cursor, with the URL as the whole state so that a view is
// shareable (FR-024, A071). The shape of the answer — `{ filters, cursor, rejected }`, never a throw
// and never a silent drop — comes from which way a mistake is dangerous. `audit_search` reads a null
// filter as "match anything", so a value this parser cannot read can only be honoured by widening
// the answer: an admin who filters on one person and mistypes the closing date would be shown that
// person's entire history, or everybody's, with nothing on the page admitting a box was ignored. So
// an unreadable param is named in `rejected` and the caller decides — A072 says so on the page, A073
// answers 400.
//
// Each key is parsed on its own rather than the object parsed once, for the same reason pointing the
// other way: one `safeParse` over the whole query fails as a unit, so a typo'd `to` would discard the
// six filters that were typed correctly and show everything. Partial credit is the point.
//
// `p_limit` is deliberately not a URL param. Page size belongs to the route the way `PAGE_SIZE`
// belongs to `/history` (A059), so wanting a bigger page is one more click rather than a number
// typed into the address bar — and `audit_search`'s own cap of 100 is the backstop either way.

/** The eleven actions `audit_log_action_known` lets a row carry. Exported because A071's filter bar
 * renders exactly these: a list the screen invents and a check constraint that refuses them are two
 * things that drift apart, and the constraint is the one that is right. */
export const AUDIT_ACTIONS = [
  "request_submitted",
  "request_approved",
  "request_declined",
  "allowance_set",
  "allowance_removed",
  "user_created",
  "user_role_changed",
  "user_region_changed",
  "user_active_changed",
  "leave_type_default_changed",
  "leave_type_changed",
] as const;

/** The four `entity` values the audit triggers write, from `private.audit_requests`,
 * `audit_profiles`, `audit_allowances` and `audit_leave_types`. */
export const AUDIT_ENTITIES = ["leave_request", "user", "allowance", "leave_type"] as const;

export const AuditFilters = z.object({
  person: z.uuid().nullable().default(null),
  action: z.enum(AUDIT_ACTIONS).nullable().default(null),
  entity: z.enum(AUDIT_ENTITIES).nullable().default(null),
  role: z.enum(["employee", "manager", "admin"]).nullable().default(null),
  // D9: real entries only unless the URL asks for demo, so the default is `false` rather than null.
  // `null` would mean "both", and no view this page offers means both.
  demo: z.enum(["true", "false"]).transform((v) => v === "true").default(false),
  // A whole calendar day in the viewer's zone; `parseFilters` turns it into the first instant of it.
  from: z.iso.date().nullable().default(null),
  // …and into the first instant of the day AFTER it, which is what makes `p_to` exclusive while the
  // URL still reads like the two dates a person typed, not like a database range.
  to: z.iso.date().nullable().default(null),
});

export type AuditFilterValues = z.infer<typeof AuditFilters>;

const FILTER_KEYS = ["person", "action", "entity", "role", "demo", "from", "to"] as const;

/** What the URL means: the seven filters as `audit_search` takes them, the cursor as the pair the
 * functions page on, and the names of any param that arrived unreadable. */
export type AuditQuery = {
  filters: AuditFilterValues;
  cursor: HistoryCursor;
  rejected: string[];
};

/**
 * One value per key. Next types a repeated query param as an array, and a form writes each key once,
 * so an array is a hand-made URL: the first is what the browser sent first. An empty string is what
 * a cleared `<select>` sends, and it means "no filter", not "invalid filter" — the difference between
 * a Reset button working and a page blaming the admin for using it.
 */
function single(value: string | string[] | undefined): string | undefined {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "" ? undefined : one;
}

/** The zone's offset from UTC at `when`, in milliseconds. Read through `Intl` rather than a table
 * because the zone database belongs to the runtime, not to this file. */
function offsetInZone(when: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(when);
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wall = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour") % 24, at("minute"), at("second"));
  return wall - Math.floor(when.getTime() / 1000) * 1000;
}

/**
 * The instant `date`'s wall-clock midnight falls at in `timeZone`, as a `Z` string PostgREST can hand
 * to a `timestamptz`, with `addDays` counted in the viewer's calendar rather than in 24-hour blocks.
 *
 * A calendar day is not 24 hours everywhere: in Australia/Sydney, 4 Oct 2026 is 23 hours long and 5
 * Apr 2026 is 25. So the offset has to be the one in force *on that day*, which is what the two
 * passes get. Each pass re-reads the offset at the instant guessed so far and re-anchors on the
 * target, which is the part that is easy to get wrong: subtracting a second time from an already
 * corrected instant subtracts it twice, and every day in the zone comes out eleven hours early.
 * Two anchored passes are enough everywhere, including the two days a year that are not 24 hours —
 * which are exactly the days a range filter can straddle.
 */
function dayStart(date: string, timeZone: string, addDays: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d + addDays);
  let instant = target - offsetInZone(new Date(target), timeZone);
  instant = target - offsetInZone(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}

/**
 * The URL query as the two audit functions want it.
 *
 * `timeZone` is the viewer's, from their own profile, because "the week starting 3 Mar" is a phrase
 * about their calendar and not about the server's (001 FR-026, and the same rule `describeWhen`
 * applies to a timestamp). It is not validated: it reaches here through `getRequestViewer()`, which
 * derives it from a `region_code` the database constrains, so a name `Intl` has not heard of cannot
 * arrive. `audit_export_csv` does check its own `p_tz`, against Postgres' zone table, which is a
 * second and deliberately not a looser opinion.
 */
export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
  timeZone: string,
): AuditQuery {
  const values: AuditFilterValues = {
    person: null,
    action: null,
    entity: null,
    role: null,
    demo: false,
    from: null,
    to: null,
  };
  const rejected: string[] = [];

  for (const key of FILTER_KEYS) {
    const parsed = AuditFilters.shape[key].safeParse(single(searchParams[key]));
    if (parsed.success) Object.assign(values, { [key]: parsed.data });
    else rejected.push(key);
  }

  const from = values.from === null ? null : dayStart(values.from, timeZone, 0);
  // `+ 1` on the *calendar*, so a one-day range is that whole day in the viewer's zone even when the
  // day is 23 hours long.
  const to = values.to === null ? null : dayStart(values.to, timeZone, 1);

  const beforeAt = single(searchParams.before_at);
  const beforeId = Number(single(searchParams.before_id));
  // The pair or nothing, which is the rule A055 and A069 both state in SQL: a cursor with one half
  // missing is not the middle of a list, it is no cursor at all, and the newest page is the honest
  // answer to a URL someone pasted badly. `before_at` is not validated — the same choice `/history`
  // makes, because Postgres is the thing that knows what a `timestamptz` is and a cursor it refuses
  // is how the error state gets reached (A054).
  const cursor: HistoryCursor =
    beforeAt !== undefined && Number.isSafeInteger(beforeId) && beforeId > 0
      ? { beforeAt, beforeId }
      : {};

  return { filters: { ...values, from, to }, cursor, rejected };
}

/**
 * A request's query, in the shape a page is handed.
 *
 * A route handler gets a `URLSearchParams` and nothing else, and the one-line conversion is the one
 * that lies: `Object.fromEntries` keeps the *last* value of a repeated key, while `single()` above —
 * and so the screen the admin is looking at — keeps the first. `?role=employee&role=manager` would
 * then answer the file with a different set of rows than the same URL shows the page, which is the
 * one promise FR-025 makes. Grouping the repeats here is what keeps first-of-array in a single place.
 */
export function queryParams(searchParams: URLSearchParams): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}

/**
 * One page of the Audit list, in one database call (A070).
 *
 * Every filter goes up whether it is set or not, except that unset is sent as `undefined` rather
 * than `null` so PostgREST applies the function's own default; `demo` is the exception and is always
 * sent, because its default here is `false` and D9 depends on the page not asking for both. RLS on
 * `audit_log` still decides every row, and `private.is_admin()` inside the function is what refuses a
 * non-admin — which arrives as `not_allowed` in `error`, the same shape `fetchMyHistory` uses so the
 * caller can tell "no entries" from "the read failed".
 */
export async function fetchAudit(
  c: Db,
  filters: AuditFilterValues,
  cursor: HistoryCursor = {},
): Promise<HistoryResult> {
  const res = await c.rpc("audit_search", {
    p_person: filters.person ?? undefined,
    p_action: filters.action ?? undefined,
    p_entity: filters.entity ?? undefined,
    p_role: filters.role ?? undefined,
    p_demo: filters.demo,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_before_at: cursor.beforeAt ?? undefined,
    p_before_id: cursor.beforeId ?? undefined,
    p_limit: cursor.limit ?? 50,
  });
  if (res.error) return { entries: [], error: res.error };
  return { entries: (res.data ?? []).map(toEntry), error: null };
}

/** The file, plus the two numbers the export route has to put on the response: how many rows the
 * file actually holds, and whether there were more than `p_limit` (FR-025, and the
 * "capped at 10,000 rows" note A072 shows). */
export type AuditExport = {
  csv: string;
  rowCount: number;
  truncated: boolean;
  error: PostgrestError | null;
};

/**
 * The same filters, no paging, one database call. `p_tz` is not optional in any real sense — the
 * generated type marks it so because Postgres will not accept a required parameter after a defaulted
 * one — so this passes the viewer's zone every time rather than letting the file come out in the
 * database's. A zone Postgres does not know raises `invalid_timezone` and arrives in `error` like any
 * other failed read — which is the right shape, because the zone comes from the reader's own profile
 * and not from the URL, so no query could have caused it (A073 answers it as a server error, not 400).
 */
export async function exportAuditCsv(
  c: Db,
  filters: AuditFilterValues,
  timeZone: string,
): Promise<AuditExport> {
  const res = await c.rpc("audit_export_csv", {
    p_person: filters.person ?? undefined,
    p_action: filters.action ?? undefined,
    p_entity: filters.entity ?? undefined,
    p_role: filters.role ?? undefined,
    p_demo: filters.demo,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_tz: timeZone,
  });
  const row = (res.data ?? [])[0];
  if (res.error || row === undefined) {
    return { csv: "", rowCount: 0, truncated: false, error: res.error };
  }
  return { csv: row.csv, rowCount: row.row_count, truncated: row.truncated, error: null };
}

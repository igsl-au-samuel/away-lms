/**
 * Writes 50,000 synthetic `audit_log` rows to the LOCAL stack so the admin Audit page can be
 * measured at production-scale volume (#333 / A068, and the precondition for #340 / A075).
 *
 *   npm run seed:audit-volume                              dry run: prints the plan, writes nothing
 *   npm run seed:audit-volume -- --apply                    writes 50,000 rows
 *   npm run seed:audit-volume -- --apply --rows 5000        a smaller run, same shape
 *
 * Needs the local stack running (`npm run db:start`) and nothing else: the SQL reaches the database
 * through `supabase db query --local`, so no keys and no API credentials are read.
 *
 * Why a direct insert instead of `private.audit_write()`, the function every real entry comes from.
 * It takes its actor from `auth.uid()`, and a script has no JWT, so all 50,000 rows would land as
 * `actor_name = 'System'` with a null `actor_id` and a null `actor_role`. `private.audit_matches`
 * tests `a.actor_role = p_role` and `a.actor_id = p_person`, and a null matches no filter, so the
 * seeded volume would be invisible to the two filters this measurement is about. A plain insert also
 * needs no trigger disabled: `audit_no_update_delete` is `before update or delete` and
 * `audit_no_truncate` is `before truncate` (20261116062027_audit_log.sql:72-78), so inserts were
 * never what the append-only rule guards. Nothing here bypasses it.
 *
 * Who the people are: every actor and subject is an existing `profiles` row. The page's Person
 * control lists profiles and nothing else, so a cast invented inside this script would produce rows
 * no operator can filter on. It also means no name is invented here — this stack's roster comes from
 * `seed:local` and `demo:load`, fictional by design. That is the trade to be aware of: the seed
 * copies whatever `profiles` holds, so it belongs on a dev stack and not beside a real directory.
 *
 * What is invented: the events. A leave-request entry gets a fresh `entity_id` rather than an id from
 * `leave_requests`, because a fabricated decision recorded against a real request would read as that
 * request's own history. `entity_id` is not rendered and links to nothing (it is not in the page's
 * query), so a dangling uuid costs nothing and impersonates nobody. Everything else follows the
 * shapes the triggers write, which makes a seeded row indistinguishable from a live one by contents
 * alone — the marker is `source_key`, where every row this script makes is prefixed `vol:`.
 *
 * Re-running is safe and adds nothing: `source_key` is `vol:<n>` with n positional, and the insert
 * ends `on conflict (source_key) where source_key is not null do nothing`, the same idiom the A027
 * backfill uses. A second `--apply` therefore reports zero new rows.
 *
 * Getting rid of them: you cannot delete them, which is what the append-only triggers are for.
 * `npm run db:reset` is the only way back to an empty log.
 */
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isLocalSupabaseUrl } from "./lib/local-guard";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const apply = args.includes("--apply");
const rows = Number(opt("rows") ?? 50_000);

if (!Number.isInteger(rows) || rows < 1 || rows > 1_000_000) {
  console.error(`--rows must be a whole number from 1 to 1,000,000 (got ${opt("rows") ?? "the default"}).`);
  process.exit(1);
}

/**
 * One row per audited event, and the only place any of it is stated: the weight drives both the
 * `pool` the rows are drawn from and the dry run's table, and the fragments become the CASE arms.
 *
 * `actor` is never a free choice. An employee cannot approve and a manager cannot change a role, so
 * the role filter gets its volume from the action rather than from a roll of the dice. The weights
 * are uneven the same way a real log is: requests get filed more often than they get decided, and
 * an admin-only action is rarer than either.
 */
type Event = {
  action: string;
  entity: "leave_request" | "allowance" | "user" | "leave_type";
  actor: "self" | "decider" | "admin";
  weight: number;
  entityId: string;
  subjectId: string;
  subjectName: string;
  before: string;
  after: string;
  context: string;
  comment: string;
};

const REQUEST_CONTEXT =
  "jsonb_build_object('leave_type_id', t.type_id, 'leave_type_name', t.type_name," +
  " 'year', t.year, 'start_date', t.start_date, 'end_date', t.end_date," +
  " 'working_days', t.working_days)";
const CANCELLATION_CONTEXT = `(jsonb_build_object('cancellation_id', t.cid) || ${REQUEST_CONTEXT})`;
const ALLOWANCE_CONTEXT =
  "jsonb_build_object('leave_type_id', t.type_id, 'leave_type_name', t.type_name," +
  " 'year', t.year, 'default_days', t.type_default)";
const TYPE_CONTEXT = "jsonb_build_object('leave_type_id', t.type_id, 'leave_type_name', t.type_name)";

const EVENTS: Event[] = [
  {
    action: "request_submitted",
    entity: "leave_request",
    actor: "self",
    weight: 27,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "null",
    after: "jsonb_build_object('status', 'pending')",
    context: REQUEST_CONTEXT,
    comment: "null",
  },
  {
    action: "request_approved",
    entity: "leave_request",
    actor: "decider",
    weight: 20,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'pending')",
    after: "jsonb_build_object('status', 'approved')",
    context: REQUEST_CONTEXT,
    comment: "t.ok_text",
  },
  {
    action: "request_declined",
    entity: "leave_request",
    actor: "decider",
    weight: 9,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'pending')",
    after: "jsonb_build_object('status', 'declined')",
    context: REQUEST_CONTEXT,
    comment: "t.no_text",
  },
  {
    action: "request_withdrawn",
    entity: "leave_request",
    actor: "self",
    weight: 5,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'pending')",
    after: "jsonb_build_object('status', 'withdrawn')",
    context: REQUEST_CONTEXT,
    comment: "null",
  },
  {
    action: "cancellation_requested",
    entity: "leave_request",
    actor: "self",
    weight: 4,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'approved')",
    after: "jsonb_build_object('status', 'approved', 'cancellation', 'requested')",
    context: CANCELLATION_CONTEXT,
    comment: "t.why_text",
  },
  {
    // `cancelled` on the leave side is not a guess: decide_cancellation settles the parent before the
    // child, so the live status the trigger reads is already cancelled by then
    // (20261126100200_withdraw_cancel_audit.sql:171-175).
    action: "cancellation_approved",
    entity: "leave_request",
    actor: "decider",
    weight: 3,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'approved', 'cancellation', 'requested')",
    after: "jsonb_build_object('status', 'cancelled', 'cancellation', 'approved')",
    context: CANCELLATION_CONTEXT,
    comment: "t.ok_text",
  },
  {
    action: "cancellation_declined",
    entity: "leave_request",
    actor: "decider",
    weight: 2,
    entityId: "t.rid",
    subjectId: "t.subj_id",
    subjectName: "t.subj_name",
    before: "jsonb_build_object('status', 'approved', 'cancellation', 'requested')",
    after: "jsonb_build_object('status', 'approved', 'cancellation', 'declined')",
    context: CANCELLATION_CONTEXT,
    comment: "t.no_text",
  },
  {
    // A null entity_id is what the writer does: allowance_overrides has no id column to name
    // (20261116062030_audit_triggers.sql:228). `before` is the type default, because the trigger
    // fires on INSERT and reads the default as the value being displaced.
    action: "allowance_set",
    entity: "allowance",
    actor: "admin",
    weight: 9,
    entityId: "null",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "jsonb_build_object('days', t.type_default)",
    after: "jsonb_build_object('days', t.new_days)",
    context: ALLOWANCE_CONTEXT,
    comment: "t.why_text",
  },
  {
    action: "allowance_removed",
    entity: "allowance",
    actor: "admin",
    weight: 3,
    entityId: "null",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "jsonb_build_object('days', t.old_days)",
    after: "jsonb_build_object('days', null)",
    context: ALLOWANCE_CONTEXT,
    comment: "t.why_text",
  },
  {
    action: "user_created",
    entity: "user",
    actor: "admin",
    weight: 4,
    entityId: "t.obj_id",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "null",
    after: "jsonb_build_object('role', t.obj_role, 'region_code', t.region_code, 'is_active', true)",
    context: "null",
    comment: "null",
  },
  {
    action: "user_role_changed",
    entity: "user",
    actor: "admin",
    weight: 3,
    entityId: "t.obj_id",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "jsonb_build_object('role', t.role_from)",
    after: "jsonb_build_object('role', t.role_to)",
    context: "null",
    comment: "null",
  },
  {
    action: "user_region_changed",
    entity: "user",
    actor: "admin",
    weight: 2,
    entityId: "t.obj_id",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "jsonb_build_object('region_code', t.region_from)",
    after: "jsonb_build_object('region_code', t.region_to)",
    context: "null",
    comment: "null",
  },
  {
    action: "user_active_changed",
    entity: "user",
    actor: "admin",
    weight: 3,
    entityId: "t.obj_id",
    subjectId: "t.obj_id",
    subjectName: "t.obj_name",
    before: "jsonb_build_object('is_active', t.was_active)",
    after: "jsonb_build_object('is_active', not t.was_active)",
    context: "null",
    comment: "null",
  },
  {
    // Both halves carry is_capped even though only the number moved: the table constraint makes
    // them change together, and the writer says an entry holding one of them cannot be read back.
    action: "leave_type_default_changed",
    entity: "leave_type",
    actor: "admin",
    weight: 3,
    entityId: "t.type_id",
    subjectId: "null",
    subjectName: "null",
    before: "jsonb_build_object('default_allowance', t.type_default, 'is_capped', true)",
    after: "jsonb_build_object('default_allowance', t.new_days, 'is_capped', true)",
    context: TYPE_CONTEXT,
    comment: "null",
  },
  {
    // No name on either side. The writer strips unchanged fields, so inventing a rename would put a
    // string on the page that no leave type has ever had.
    action: "leave_type_changed",
    entity: "leave_type",
    actor: "admin",
    weight: 3,
    entityId: "t.type_id",
    subjectId: "null",
    subjectName: "null",
    before: "jsonb_build_object('is_active', t.was_active, 'sort_order', t.sort_from)",
    after: "jsonb_build_object('is_active', not t.was_active, 'sort_order', t.sort_to)",
    context: TYPE_CONTEXT,
    comment: "null",
  },
];

const totalWeight = EVENTS.reduce((s, e) => s + e.weight, 0);

const arms = (field: keyof Event): string =>
  EVENTS.map((e) => `      when '${e.action}' then ${e[field]}`).join("\n");

function buildSql(): string {
  const mix = EVENTS.map((e) => `    ('${e.action}', '${e.entity}', '${e.actor}', ${e.weight})`).join(",\n");
  return `insert into public.audit_log (
  created_at, actor_id, actor_role, actor_name,
  action, entity, entity_id, subject_id, subject_name,
  before, after, context, comment, is_demo, is_backfilled, source_key
)
with
-- Ordinals, because one random integer has to address every attribute of the same person. Four
-- independent scalar subqueries would name four different people in one row.
people as (
  select row_number() over (order by id) as n, id, full_name, role::text as role, is_demo
  from public.profiles
),
deciders as (
  select row_number() over (order by id) as n, id, full_name, role::text as role, is_demo
  from public.profiles where role in ('manager', 'admin')
),
admins as (
  select row_number() over (order by id) as n, id, full_name, role::text as role, is_demo
  from public.profiles where role = 'admin'
),
types as (
  select row_number() over (order by id) as n, id, name, default_allowance
  from public.leave_types
),
regions as (
  select row_number() over (order by code) as n, code from public.holiday_regions
),
-- Only pairs whose two sides differ, so a "changed" entry never records a value moving to itself.
rolepairs as (
  select row_number() over (order by a, b) as n, a, b
  from (values ('employee', 'manager'), ('manager', 'employee'),
               ('employee', 'admin'), ('manager', 'admin')) v(a, b)
),
regionpairs as (
  select row_number() over (order by x.code, y.code) as n, x.code as a, y.code as b
  from public.holiday_regions x join public.holiday_regions y on y.code <> x.code
),
mix(action, entity, actor, weight) as (
  values
${mix}
),
pool as (
  select row_number() over (order by m.action, g.k) as n, m.action, m.entity, m.actor
  from mix m cross join lateral generate_series(1, m.weight) g(k)
),
sizes as (
  select (select count(*)::int from people) as people,
         (select count(*)::int from deciders) as deciders,
         (select count(*)::int from admins) as admins,
         (select count(*)::int from types) as types,
         (select count(*)::int from regions) as regions,
         (select count(*)::int from rolepairs) as rolepairs,
         (select count(*)::int from regionpairs) as regionpairs,
         (select count(*)::int from pool) as pool
),
draws as (
  -- floor(), not a bare ::int: Postgres' cast to integer rounds, so (random() * 4)::int over a
  -- four-row pool reaches 4 as often as 2 and every index would be off by one at the top end.
  select g.i,
         1 + floor(random() * s.people)::int as subj_n,
         1 + floor(random() * s.people)::int as obj_n,
         1 + floor(random() * s.deciders)::int as dec_n,
         1 + floor(random() * s.admins)::int as adm_n,
         1 + floor(random() * s.types)::int as type_n,
         1 + floor(random() * s.regions)::int as region_n,
         1 + floor(random() * s.rolepairs)::int as rolepair_n,
         1 + floor(random() * s.regionpairs)::int as regionpair_n,
         1 + floor(random() * s.pool)::int as mix_n,
         current_date - floor(2 + random() * 540)::int as day,
         8 + floor(random() * 9)::int as hour,
         floor(random() * 60)::int as minute,
         2 + floor(random() * 28)::numeric as qty,
         gen_random_uuid() as rid,
         gen_random_uuid() as cid,
         random() < 0.5 as coin
  from generate_series(1, ${rows}) g(i) cross join sizes s
),
picked as (
  select d.i, d.day, d.hour, d.minute, d.qty, d.rid, d.cid, d.coin,
         x.action, x.entity, x.actor,
         sp.id as subj_id, sp.full_name as subj_name, sp.role as subj_role, sp.is_demo as subj_demo,
         op.id as obj_id, op.full_name as obj_name, op.role as obj_role,
         dp.id as dec_id, dp.full_name as dec_name, dp.role as dec_role, dp.is_demo as dec_demo,
         ap.id as adm_id, ap.full_name as adm_name, ap.role as adm_role, ap.is_demo as adm_demo,
         lt.id as type_id, lt.name as type_name,
         coalesce(lt.default_allowance, 20) as type_default,
         rp.a as role_from, rp.b as role_to,
         gp.a as region_from, gp.b as region_to,
         rg.code as region_code
  from draws d
  join pool x on x.n = d.mix_n
  join people sp on sp.n = d.subj_n
  join people op on op.n = d.obj_n
  join types lt on lt.n = d.type_n
  join regions rg on rg.n = d.region_n
  join rolepairs rp on rp.n = d.rolepair_n
  join regionpairs gp on gp.n = d.regionpair_n
  left join deciders dp on dp.n = d.dec_n
  left join admins ap on ap.n = d.adm_n
),
stamped as (
  -- A weekday, inside working hours, and never in the future. Paging is a keyset on
  -- (created_at desc, id desc) and the first page asks for rows older than now(), so an entry
  -- stamped ahead of the clock would not appear on the page being measured at all.
  select p.*,
         least(
           (case extract(isodow from p.day)::int
                when 6 then p.day + 2
                when 7 then p.day + 1
                else p.day
              end)::timestamptz + make_interval(hours => p.hour, mins => p.minute),
           now() - interval '1 hour'
         ) as ts
  from picked p
),
booked as (
  select s.*,
         s.ts::date + 3 + floor(random() * 80)::int as start_date,
         extract(year from s.ts)::int as year,
         s.qty as new_days,
         greatest(1, s.qty - 1 - floor(random() * 6)::int) as old_days,
         1 + floor(random() * 5)::int as span,
         1 + floor(random() * 12)::int as sort_from,
         1 + floor(random() * 12)::int as sort_to,
         s.coin as was_active,
         (array ['Enjoy it', 'Cover is arranged', 'Approved', 'Booked it in', 'Looks fine'])
           [1 + floor(random() * 5)::int] as ok_text,
         (array ['Peak week', 'No cover that week', 'The whole team is away', 'Not this range'])
           [1 + floor(random() * 4)::int] as no_text,
         (array ['Family emergency', 'A medical appointment', 'Something came up',
                 'Travel changed', 'Personal reasons'])
           [1 + floor(random() * 5)::int] as why_text
  from stamped s
),
shaped as (
  select b.*,
         b.start_date + b.span as end_date,
         greatest(0.5, round(((b.span + 1) * 5.0 / 7)::numeric, 1)) as working_days
  from booked b
)
select
  t.ts,
  case t.actor when 'self' then t.subj_id when 'decider' then t.dec_id else t.adm_id end,
  case t.actor when 'self' then t.subj_role when 'decider' then t.dec_role else t.adm_role end
    ::public.app_role,
  case t.actor when 'self' then t.subj_name when 'decider' then t.dec_name else t.adm_name end,
  t.action,
  t.entity,
  case t.action
${arms("entityId")}
  end,
  case t.action
${arms("subjectId")}
  end,
  case t.action
${arms("subjectName")}
  end,
  case t.action
${arms("before")}
  end,
  case t.action
${arms("after")}
  end,
  case t.action
${arms("context")}
  end,
  case t.action
${arms("comment")}
  end,
  case t.actor when 'self' then t.subj_demo when 'decider' then t.dec_demo else t.adm_demo end,
  -- Not a backfill: these are meant to read as live entries, which is what makes them worth timing.
  -- They are identifiable instead by source_key, whose "vol:" prefix no writer produces.
  false,
  'vol:' || t.i
from shaped t
on conflict (source_key) where source_key is not null do nothing;
`;
}

/**
 * Statistics, because a page timed against a table the planner has never seen measures a plan no
 * production query would choose. A075 is a timing measurement, so this belongs to the seed. Its own
 * statement, and it has to be: the CLI sends a file as one prepared statement, so a second command
 * in the same file fails with "cannot insert multiple commands into a prepared statement".
 */
const ANALYZE = "analyze public.audit_log";

/**
 * `shell: true` is not a preference: spawning `npx`, `supabase` or `node_modules/.bin/supabase.cmd`
 * directly fails on this machine with ENOENT and EINVAL, because Node refuses to run a .cmd shim
 * without a shell. That is also why every statement goes through a file rather than argv: a shell
 * expands `%...%` and breaks on newlines, so an inline query arrives at the database changed. The
 * only thing interpolated below is a temp path this script made. The trailing semicolon is stripped
 * for the same reason it is stripped from the file: a statement terminator is what separates two
 * commands, and only one command survives the trip.
 */
function query(sql: string): string {
  const file = join(tmpdir(), `seed-audit-volume-${process.pid}-${++seq}.sql`);
  writeFileSync(file, sql.trim().replace(/;[\s]*$/, ""), "utf8");
  try {
    const r = spawnSync(`npx supabase db query --local --output-format json --file "${file}"`, {
      encoding: "utf8",
      shell: true,
    });
    if (r.status !== 0) throw new Error(`supabase db query failed:\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  } finally {
    rmSync(file, { force: true });
  }
}

let seq = 0;

/** The CLI prints banners around the array, so take the array and nothing else. */
function parseJson(stdout: string): unknown {
  const start = stdout.indexOf("[");
  if (start === -1) throw new Error(`No JSON in the CLI output:\n${stdout}`);
  let depth = 0;
  let inString = false;
  for (let i = start; i < stdout.length; i++) {
    const c = stdout[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(stdout.slice(start, i + 1));
    }
  }
  throw new Error(`Unterminated JSON in the CLI output:\n${stdout}`);
}

function dbUrl(): string {
  const r = spawnSync("npx supabase status -o env", { encoding: "utf8", shell: true });
  const m = /^DB_URL="?([^"\r\n]+)"?/m.exec(r.stdout ?? "");
  if (r.status !== 0 || !m) {
    console.error("Could not read DB_URL from `supabase status`. Is the local stack running?");
    console.error("Start it with: npm run db:start");
    process.exit(1);
  }
  return m[1];
}

function counts(): Record<string, number> {
  const q = `select
    (select count(*)::int from public.profiles) as profiles,
    (select count(*)::int from public.profiles where role in ('manager','admin')) as deciders,
    (select count(*)::int from public.profiles where role = 'admin') as admins,
    (select count(*)::int from public.leave_types) as leave_types,
    (select count(*)::int from public.holiday_regions) as regions,
    (select count(*)::int from public.audit_log) as audit_log,
    (select count(*)::int from public.audit_log where source_key like 'vol:%') as already_seeded`;
  return (parseJson(query(q)) as Record<string, number>[])[0];
}

function main(): void {
  const url = dbUrl();
  if (!isLocalSupabaseUrl(url)) {
    console.error(`Refusing to seed: ${url} does not point at this machine.`);
    process.exit(1);
  }

  const c = counts();
  const thin = (
    Object.entries({
      profiles: c.profiles,
      "manager or admin": c.deciders,
      admin: c.admins,
      "leave types": c.leave_types,
      regions: c.regions,
    }) as [string, number][]
  ).filter(([, n]) => n === 0);
  if (thin.length) {
    console.error(`Refusing to seed: no rows for ${thin.map(([w]) => w).join(", ")}.`);
    console.error("The seed draws every actor and subject from tables you do not have yet.");
    console.error("Run `npm run db:reset`, then `npm run seed:local`.");
    process.exit(1);
  }

  console.log(`Database  ${url.replace(/:[^:/]*@/, ":***@")}`);
  console.log(`Pool      ${c.profiles} profiles (${c.deciders} who can decide, ${c.admins} admin),` +
    ` ${c.leave_types} leave types, ${c.regions} regions`);
  console.log(`Log now   ${c.audit_log} entries, ${c.already_seeded} of them from this script`);
  console.log(`Rows      ${rows.toLocaleString()} (${apply ? "write" : "dry run: nothing will be written"})\n`);

  console.log("Action mix, drawn by weight:");
  for (const e of EVENTS) {
    const pct = ((e.weight / totalWeight) * 100).toFixed(1).padStart(4);
    console.log(`  ${pct}%  ${String(Math.round((e.weight / totalWeight) * rows)).padStart(6)}  ` +
      `${e.action.padEnd(28)} by ${e.actor.padEnd(7)} on ${e.entity}`);
  }

  if (!apply) {
    console.log("\nDry run. Add --apply to write. Re-running after --apply adds nothing: the keys are");
    console.log("positional (`vol:<n>`) and every one of them conflicts.");
    return;
  }

  const started = Date.now();
  query(buildSql());
  query(ANALYZE);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const after = counts();
  console.log(`\nWrote ${after.audit_log - c.audit_log} rows in ${secs}s; the log now holds ${after.audit_log}.`);
  if (after.audit_log === c.audit_log) {
    console.log("Nothing new: `vol:1..n` was already there. db:reset first for a fresh load.");
  }

  const spread = parseJson(query(`select
      case when left(source_key, 4) = 'vol:' then 'seed' else 'live' end as kind, count(*)::int as n,
      min(created_at)::date as oldest, max(created_at)::date as newest,
      count(*) filter (where actor_role = 'employee')::int as by_employee,
      count(*) filter (where actor_role = 'manager')::int as by_manager,
      count(*) filter (where actor_role = 'admin')::int as by_admin,
      count(*) filter (where is_demo)::int as demo
    from public.audit_log group by 1 order by 2 desc`)) as Record<string, unknown>[];
  console.log("\nBy origin:");
  for (const r of spread) {
    console.log(`  ${String(r.kind).padEnd(6)} ${String(r.n).padStart(6)}  ${r.oldest} .. ${r.newest}` +
      `  employee=${r.by_employee} manager=${r.by_manager} admin=${r.by_admin} demo=${r.demo}`);
  }
  const shapes = parseJson(query(`select
      count(*) filter (where after is null)::int as null_after,
      count(*) filter (where actor_role is null)::int as null_role,
      count(*) filter (where actor_id is null)::int as null_actor,
      count(*) filter (where created_at > now())::int as future,
      count(distinct actor_id)::int as actors,
      count(*) filter (where entity = 'allowance' and entity_id is not null)::int as bad_allowance_id
    from public.audit_log where source_key like 'vol:%'`)) as Record<string, number>[];
  const s = shapes[0];
  console.log(`\nShape check on the seeded rows: ${s.null_after} with a null "after", ${s.null_role}` +
    ` with no actor role, ${s.null_actor} with no actor id, ${s.future} stamped in the future,` +
    ` ${s.bad_allowance_id} allowance rows carrying an entity_id.`);
  console.log(`Distinct actors: ${s.actors}.`);
  console.log("These rows cannot be deleted. npm run db:reset is the only way back to an empty log.");
}

main();

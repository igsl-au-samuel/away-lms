# Quickstart: validating the audit log

Run after the migrations for [plan.md](plan.md) exist. **Slice 1 is on `main`**:
[#354](https://github.com/igsl-au-samuel/away-lms/pull/354) merged 2026-11-17 as `ad5daa7`, so
steps 1–3 apply now; step 4 needs slice 2 (A038), step 5's `/history` and `/admin/audit` screens
need slices 3–4, and step 6 needs slice 4 (A068). Where a sentence below describes something slice
1 does not deliver yet, it says so. Details live in [data-model.md](data-model.md) and
[contracts/](contracts/).

The whole page was walked on a clean local database on 2026-11-17 for A080. Anything marked
*measured* came from that run against `main`. Steps 4 and 6 could not be run — their migrations
have not merged — so they were checked instead for saying honestly what is not built yet.

## Prerequisites

- Docker running, local Supabase started (`npm run db:start`). The ports come from
  `supabase/config.toml`: API on `55321`, Postgres on `55322` — not the CLI defaults.
- Dependencies installed (`npm ci`). No new dependency and no new service (Constitution I).
- **`npm run build` and `npm run test:e2e` have to run from a clone with a real `node_modules`.**
  In a `git worktree` whose `node_modules` is a symlink they stop with
  `Could not find the Next.js package (next/package.json)`, because Turbopack will not compile
  outside the workspace root. Lint, typecheck, unit tests, `db:test` and `db:lint` do work from a
  worktree. *Measured 2026-11-17.*
- One local stack per machine, shared by every worktree. Claim it on #361 (`holding DB`, then
  `released DB`) before the reset below: another session's test run writes into `audit_log` while
  you are counting its rows, and a green count means nothing if a `db:reset` lands under you.
- Local seed users: `npm run seed:local -- --password <pw>` creates **four** accounts — one admin,
  one manager, two employees (`scripts/seed-local.ts`). Reference data (leave types, holiday
  regions) arrives with the migrations, but a reset empties `profiles` and the auth users, so
  steps 2, 3 and 5 need the reseed first.

## 1. Database tests

```bash
npm run db:reset           # applies migrations (the backfill joins this line in slice 2, A038)
npm run db:test            # pgTAP: rows 28–40 today, 41–42 with slices 3–4; events; behaviour
npm run db:lint            # function search_path, and tables exposed without RLS
```

Expected: all green. The existing 001 tests pass unchanged (SC-009).

*Measured 2026-11-17.* `db:reset` applies every file in `supabase/migrations` (30 today) and then
prints `no files matched pattern: supabase/seed.sql` — that warning is normal, there is no seed
file; the reference data comes from a migration. `db:test` runs 62 files / 663 assertions and
passes. `db:lint` lints `extensions`, `private`, `public` and `tests` and finds nothing.

On a machine that runs the whole stack locally, `npm run test:e2e` needs two more things than this
page used to say.

The first is the values from `.env.local` in the process, and Playwright is the one command that
does not load the file itself — `playwright.config.ts` has no env loading, so export it once:

```bash
set -a; . ./.env.local; set +a
```

Without it the run dies before collecting anything: `oauth-consent.spec.ts` imports the integration
helpers, whose module-level guard throws `Integration tests refuse to run against (no URL): not a
local Supabase URL`, and the specs that build their own service-role client throw
`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.` (`admin.spec.ts:13`).
`npm run test:integration` needs neither, because `vitest.integration.config.ts:6` calls
`process.loadEnvFile(".env.local")`, and `npm run seed:local` has read the file on its own since
#367 (`tsx --env-file-if-exists=.env.local`).

The second is `npm run seed:local -- --password "$E2E_PASSWORD"` after any `db:reset`, which clears
`profiles` and the auth users; without a reseed every signed-in spec fails with "Invalid email or
password", and `tests/e2e/fixtures.ts:15` says `E2E_PASSWORD is not set (the password used with
npm run seed:local)`. The `--password` value is read from `process.argv` (`scripts/seed-local.ts:24`),
not from the env, so the shell has to have sourced the file for that expansion to be anything: an
empty one falls through to the interactive prompt rather than seeding a blank password. Serially (`--workers=1`) the 24 tests in 11 files pass in *measured* 37–46 s on this
machine, including the build: `playwright.config.ts` runs `npm run build && next start -p 3100` as
its `webServer` and reuses one already listening. In parallel on one local stack they time out.

## 2. Event check by hand

Each step below runs **as that role** — through the API, or the app with `npm run dev`. Not as one
admin session in `psql`: an admin session has no login behind it, so every entry would come out
with actor `System` and the check would prove nothing. The owner session is the last step precisely
because it is the odd one out.

1. Submit a request as the employee, approve it as the manager with a comment.
2. Set then remove an allowance for the employee, with a reason.
3. Change a user's role and region in one save.
4. Change a leave type's default allowance and its name in one save.
5. As the table owner in `psql` or Studio, change one column of some profile.
6. `select created_at, actor_name, actor_role, action, subject_name, before, after, comment
   from audit_log order by created_at desc, id desc limit 20;`

Expected: one entry per event (two for step 3, two for step 4), actor roles correct, the
direct SQL changes show actor `System`, and the allowance reason appears as the comment.

*Measured 2026-11-17*, over PostgREST with a real JWT for each seeded account. All of that holds:
role and region in one save write two entries, default and name in one save write two, and the
owner's update writes one with actor `System`. Three things the list above does not say:

- A freshly seeded database already has four `user_created` entries before you do anything, every
  one with actor `System` — `seed:local` writes the profiles with the secret key, and the trigger
  falls back to `System` when the session has no login. `actor_role` is empty on those rows, so
  "actor roles correct" is only a check on the signed-in entries.
- The two leave-type entries have `subject_name` empty by design: a default belongs to everybody
  and a rename belongs to the admin alone, which is why they are two actions and not one.
- The "saving the same number again writes nothing" guard compares the **stored override**, not the
  effective days. Setting 21 for a type whose default is 21, where no override exists yet, does
  write an entry (`before` and `after` both `{"days": 21.0}`) because that inserts a row; repeating
  the same stored number writes nothing the second time.

Slice 1 delivers all of that **except the allowance comment**: `admin_set_allowance` will not set
`away.audit_reason` until A039 (slice 2), so in slice 1 the entry's `comment` is null and the reason
lives only in `allowance_changes.reason`. `audit_events_allowances.sql` proves the mechanism works by
setting that GUC directly, including R2's rule that an empty reason after a non-empty one in the same
transaction does not inherit it.

## 3. Append-only check

As each of anon, employee, manager, admin and with the secret key, try `update`, `delete` and
`insert` on `audit_log`, and try `truncate` in a session that owns the table (it cannot be sent
over HTTP — that is why the SQL tests carry it). Count the rows before and after; the count is the
thing being checked.

Expected: every API attempt fails with `42501 permission denied`, the secret key included —
Postgres checks grants before it fires a trigger. `audit_immutable` answers only a session that
owns the table. The row count is the same either way.

*Measured 2026-11-17* over the API (PostgREST, real JWTs, the seeded accounts): the fifteen
update / delete / insert attempts — three per identity across the five roles — are all refused with
`42501 permission denied for table audit_log` (HTTP 401 for anon and the secret key, 403 for the
three signed-in roles), and the row count does not move. One case in the earlier measurement was
reported wrongly, and it is worth knowing because it looks like a pass: a PostgREST `on_conflict`
upsert is **not** refused by the grants. It dies at parse time with
`42P10 there is no unique or exclusion constraint matching the ON CONFLICT clause`, because the
only unique index on `source_key` is partial (`where source_key is not null`). Nothing is written,
so the count is still the same — but the reason is the index, not the guard.

In an owner session `psql` reports `audit_immutable` for `truncate`, `update` and `delete`, and a
hand-built `insert` fails on the not-null columns first. What an owner *can* do, and did in this
walk before being undone again, is:

```sql
alter table public.audit_log disable trigger audit_no_update_delete;  -- succeeds silently
```

That is the table-owner access [ADR 0017](../../docs/decisions/0017-audit-by-triggers-append-only.md)
records. The guard is a database rule for everyone else and a review rule for the owner, which is
why "Notes for migrations" at the bottom of this page asks for a sentence in the PR. See A004–A006
in [tasks.md](tasks.md) and the `service_role` row of rows 36–39 in
[contracts/access-matrix.md](contracts/access-matrix.md), settled in the slice 1 review in #354:
the secret key is refused by the grants, and the trigger stays as the owner-session guard.

## 4. Backfill check

On a database with pre-existing requests and allowance changes (a copy of the pre-migration
state): run the migration, then `select count(*) from audit_log where is_backfilled;`,
then run `select private.audit_backfill();` again as the database owner (the API cannot
call it) and count again.

Expected: one `submitted` entry per request, one decision entry per decided request, one
entry per old allowance change, original times and people, and the same count after the
second run (SC-006).

Before migration B: confirm `select count(*) from allowance_changes` equals the count of
`audit_log` rows with `source_key like 'ac:%'`.

*Checked 2026-11-17, not run*: `private.audit_backfill()` is not on `main` — that is A038, in
slice 2 — so nothing above can be executed yet. When it lands, do it against a copy of a
pre-migration database, not a stack you have just reset: a reset applies the migration on the way
up, and then there is nothing left to carry over.

## 5. App check

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration   # demo load, reset and remove leave audit entries alone
npm run test:e2e           # My history, Audit page filters, CSV export, access refusal
npm run build
```

*Measured 2026-11-17 against `main`.* The first line and `npm run build` are the 001 suite and pass
as they did before slice 1 (290 unit tests). `test:integration` is today's demo-load, reset and
remove-demo suite — 68 tests in 12 files, all passing; the `audit_log` snapshots from A032 live in
it. `test:e2e` is 24 specs in 11 files and **none of them is about `/history` or `/admin/audit`
yet**: those are A054 and A067, in slices 3 and 4. So the two comments above, and the manual list
below, describe the finished feature — treat them as the target, not as what passes today.

Manually, with `npm run dev`:

- Employee: `/history` shows only their entries; `/admin/audit` is refused.
- Manager: `/history` also shows entries for requests they can decide; the Approvals page
  allowance panel still works.
- Admin: `/admin/audit` filters by person, action, entity, role, demo/real and dates;
  Export CSV downloads the same rows; a comment starting `=1+1` opens as text in a
  spreadsheet.
- Delete a demo user (remove demo): their entries still appear with their name.

## 6. Performance check

Seed 50,000 entries (a script in `scripts/`, fictional data only), then time
`audit_my_history`, a filtered `audit_search` page and a 10,000-row `audit_export_csv`.

Expected: pages under 2 s, export under 30 s (SC-008).

*Checked 2026-11-17, not run*: none of it exists yet on `main`. The volume seed in
`scripts/seed-audit-volume.ts` is A068, `audit_my_history` is A055, and `audit_search` /
`audit_export_csv` are A069. What `private` holds today is seven `audit`-prefixed functions:
`audit_write` (the only write path), `audit_actor`, `audit_immutable` (the guard behind both
`audit_no_update_delete` and `audit_no_truncate`) and the four table trigger functions
`audit_profiles`, `audit_requests`, `audit_allowances` and `audit_leave_types`. Listing this here
so that a walker who finds nothing to run can tell "not built" from "broken".

Count `private` by what it has to do with the audit rather than by its name, though, and you get
eight, not seven: `can_view_audit(p_actor, p_subject, p_entity, p_action)` is the eighth and does
not start with `audit_`, so
`select proname from pg_proc where pronamespace = 'private'::regnamespace and proname like '%audit%'`
returns eight rows on a database built from `main` alone. It is research R6's whole visibility rule
in one `security definer` function with an empty
`search_path`, and `audit_log_select` calls it — which is why it, and not the seven, is granted to
`authenticated`: a policy is evaluated as the calling role, so that role needs the call
(`20261116062027_audit_log.sql:117-125`, and `20261116062030_audit_triggers.sql:103` names it as the
one exception to revoking every `private` function by name). The split is clean — seven write-path
and guard functions, one read rule — so eight rows is not a broken build. Nine `private`
functions are executable by `authenticated` in all; the other eight come from feature 001
(`current_role`, `is_admin`, `is_approver`, `validate_request`, `available_balance`,
`count_working_days` and the two calendar enqueue functions).

Eight is also only what the migrations on `main` create. A038 adds `private.audit_backfill()`, so a
stack built from its branch reports nine. *Measured on this machine 2026-11-17: nine rows, while no
migration on `main` creates that function — and the only ref that carries
`20261117022917_audit_backfill.sql` is `feat/303-audit-backfill`, so the shared local database had
been reset from a tree containing it, not from `main`. `supabase/tests/audit_backfill.sql` on `main`
asserts against the function but does not define it, so a guarded test is not the source either.*
On one stack that several sessions share, that is the normal state rather than a fault: count the
rows, then check `supabase/migrations` on the tree the stack was actually built from before filing
the difference.

## Notes for migrations

Any later migration that rewrites `profiles`, `leave_requests`, `allowance_overrides` or
`leave_types` fires the audit triggers and would write false entries: rows that read as
though a person made the change, with actor `System` because a migration has no login.
Check each such migration, and say in the PR how it avoids them. Two answers are accepted
(`docs/TEAM.md` states the rule; `.github/pull_request_template.md` asks for it):

- **A deliberate carry-over.** Either write the `audit_log` rows directly as the table
  owner — the backfill migration does this (A038): `insert … on conflict (source_key) do
  nothing`, `is_backfilled = true`, original `created_at`, so a rerun adds nothing. Only
  an owner session can: `authenticated` holds `select` and nothing else, `anon` and
  `service_role` hold nothing at all, and no trigger blocks an insert. Or suppress the
  triggers for the session with
  `set session_replication_role = replica` while rewriting the source rows, which is what
  the pgTAP fixtures (A034) and the 50k seed (A068) do. Either way the migration's whole
  job has to be moving history — it is not a switch to reach for when entries are
  inconvenient.
- **No entries are expected.** Each change trigger guards on columns, so name the columns
  the rewrite touches and show that none of them is audited. What writes today:
  `leave_requests` — every insert, and an update that moves `status` off `pending`;
  `allowance_overrides` — every insert and delete, and an update that changes `days`;
  `profiles` — every insert, and an update that changes `role`, `region_code` or
  `is_active`; `leave_types` — an update that changes `default_allowance`, `is_capped`,
  `name`, `is_active` or `sort_order` (no insert trigger). A rewrite that inserts or
  deletes rows in the first three tables always writes, so say so rather than reaching for
  the first answer.

`alter table … disable trigger`, and dropping or recreating a trigger, are not ways to
satisfy this note: they change what the log promises for the rows written around them.
The exception is a migration that alters `audit_log` itself and so has to drop
`audit_no_update_delete` or `audit_no_truncate` to do it — the immutability trigger's own
detail message allows exactly that. Such a PR says so and is reviewed as a protected-area
change.

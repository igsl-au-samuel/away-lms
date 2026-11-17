# Quickstart: validating the audit log

Run after the migrations for [plan.md](plan.md) exist. **Slice 1 is on `main`**:
[#354](https://github.com/igsl-au-samuel/away-lms/pull/354) merged 2026-11-17 as `ad5daa7`, so
steps 1–3 apply now; step 5's `/history` and `/admin/audit` screens need slices 3–4, and step 6
needs slice 4 (A068). Step 4's function landed with A038 but a local stack cannot exercise it —
that step says so where it stands. Where a sentence below describes something slice
1 does not deliver yet, it says so. Details live in [data-model.md](data-model.md) and
[contracts/](contracts/).

The whole page was walked on a clean local database on 2026-11-17 for A080. Anything marked
*measured* came from a run against `main`, from a CI job on it, or from a query against the shared
local stack, and each note says which. Steps 4 and 6 were not runnable on that walk because their
migrations had not merged; A038 has since merged so step 4 is reachable but not demonstrable
locally, and step 6 is still not built. Both say so where they stand.

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
npm run db:reset           # applies migrations — the A038 backfill is in this line now, and
                           # finds no history to carry on a reset stack (see step 4)
npm run db:test            # pgTAP: rows 28–40 today, 41–42 with slices 3–4; events; behaviour
npm run db:lint            # function search_path, and tables exposed without RLS
```

Expected: all green. The existing 001 tests pass unchanged (SC-009).

*Measured 2026-11-17, and re-read from the CI `db` job on `main` at `706e6db` (run 44078161703).*
`db:reset` applies every file in `supabase/migrations` (31 today) and then
prints `no files matched pattern: supabase/seed.sql` — that warning is normal, there is no seed
file; the reference data comes from a migration. `db:test` runs 63 files / 708 assertions and
passes. The A080 walk measured 62 / 663 on `7857562`, and the move is traceable rather than vague:
the extra file is `supabase/tests/audit_backfill.sql`, which A034 added and `7857562` did not have.
It came in guarded, so it was 63 / 670 as soon as the slice 2 test work was in (runs 44075317017 and
44076678193 — A035 and A036 add cases to two existing files in the same window, so that +7 is a
group, not one PR) and 63 / 708 from A038, whose only test change was to delete that guard: the +38
is the assertions it had been skipping. `db:lint` lints
`extensions`, `private`, `public` and `tests` and finds nothing.

*Re-read the same day from the CI `db` job on `main` at `4900c2b` (run 44086961753, closed
12:54:23Z): **32** migrations — `20261117031500_audit_allowance_swap.sql` is the newest — and
`db:test` runs **64 files / 712 assertions** and passes, `db:lint` still clean. The one new file is
`supabase/tests/row42_audit_my_history.sql`, which A051 delivered guarded, so it contributes 1 of
its 16 assertions until A055 creates `public.audit_my_history()` and the guard comes out.*

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
its `webServer` and reuses one already listening. In parallel on one local stack they time out. That
count is `7857562`'s, not today's: the `e2e` job on `main` at `e282de2` runs 29 tests and passes in
28.3 s, on CI's own concurrency with `retries: 2` (`playwright.config.ts:8`) rather than
`--workers=1`, so the two times are not comparable — only the 29 is. Step 5 writes out the one
command that finds the current number, so neither pair above is something to rely on for long.

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

*Checked 2026-11-17 against `main` at `706e6db`*: the first half of this note used to say the
function was not on `main` yet. A038 merged as #386 at 11:54:05Z, so `private.audit_backfill()` is
there now, revoked from `public, anon, authenticated, service_role`
(`20261117022917_audit_backfill.sql:176`) and therefore callable only as the database owner — the
`select private.audit_backfill();` above still has to be typed by hand, not through the API. The
warning is now the part that matters, and *measured on this machine 2026-11-17 on a stack reset
from `main`*: `audit_log` holds 61 rows and `is_backfilled` is true for **0** of them;
`select count(*) from allowance_changes` is **0** and the count of rows with
`source_key like 'ac:%'` is **0**. Every check above is therefore true here as `0 = 0` and proves
nothing — the same vacuous shape as the `allowance_changes` / `ac:%` equality three lines above,
which is why A045 is Sam's to read rather than a number for an agent to tick. The reason is
structural, not a timing accident: the migration calls the carry-over as it applies
(`20261117022917_audit_backfill.sql:179`), and at that moment a reset database has no history to
carry — nothing in `supabase/migrations` puts rows into `leave_requests` or `allowance_changes`
while it runs (the four inserts there are inside `submit_leave_request`, `admin_set_allowance` and
friends, which only execute when called), and the demo people and their requests arrive afterwards
through `npm run seed:local`, a `service_role` API client whose writes are live entries with a JWT
behind them, not backfilled ones. `Deploy DB` run 44078161722 applied the same migration to
production at 11:54:34Z, so the one place this can still be shown is a copy taken before that
minute. Do it there, or not at all; never tick SC-006 off a local `db:reset`.

## 5. App check

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration   # demo load, reset and remove leave audit entries alone
npm run test:e2e           # My history, Audit page filters, CSV export, access refusal
npm run build
```

*Measured from the CI jobs on `main` at `4900c2b` (run 44086961753, 2026-11-17).* These numbers move
with every merge — this page was re-pointed twice in the last hour — so the sentence below is worth
less than the command that re-derives it:

```bash
gh run list --workflow ci.yml --branch main --limit 1 --json headSha,databaseId,conclusion
```

That names the commit `main` is on and the run that proves it; the run's `unit`, `integration`,
`db` and `e2e` job logs print the four numbers, and the `db` log's `Files=…, Tests=…` line is the
pgTAP pair step 1 asks about. As measured, they are: unit 23 files, **310 passing and none
skipped**; integration 13 files, 73 passing — the `audit_log` snapshots from A032 live there;
`db:test` 64 files / 712 assertions; `test:e2e` 29 passing across 12 spec files.

The unit pair moved on its own: at `706e6db` it was 298 passing with **12 skipped**, all twelve in
`tests/unit/allowance-log.test.ts`, because A037 had written its mapper tests against a module that
did not exist yet and parked them behind `describe.skipIf(!mapperLanded)` and an
`@ts-expect-error` on the import. A040 landed `src/server/allowance-log.ts` and deleted both in the
same commit (`e282de2`), which is the pairing to remember when reading any of these notes: the
parked test and the parked typecheck error are one change, and landing only one of them reddens
either the suite or `npm run typecheck`.

`test:e2e` still covers none of `/history` or `/admin/audit` — no such spec exists in `tests/e2e` on
this commit — because those screens are A054 and A067, in slices 3 and 4. So the two comments above,
and the manual list below, describe the finished feature; treat them as the target, not as what
passes today.

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
`audit_export_csv` are A069. What `private` holds today is eight `audit`-prefixed functions:
`audit_write` (the only write path), `audit_actor`, `audit_immutable` (the guard behind both
`audit_no_update_delete` and `audit_no_truncate`), the four table trigger functions
`audit_profiles`, `audit_requests`, `audit_allowances` and `audit_leave_types`, and since A038
merged, `audit_backfill` — the only one of the eight that no role but the database owner can call.
Listing this here so that a walker who finds nothing to run can tell "not built" from "broken".

Count `private` by what it has to do with the audit rather than by its name, though, and you get
nine, not eight: `can_view_audit(p_actor, p_subject, p_entity, p_action)` is the extra one and does
not start with `audit_`, so
`select proname from pg_proc where pronamespace = 'private'::regnamespace and proname like '%audit%'`
returns nine rows on a database built from `main` at `e282de2` — eight write-path, guard, trigger
and backfill functions plus one read rule, and the migration set is `706e6db`'s unchanged, 31 files,
because A040 is a TypeScript-only PR. *Measured on this machine 2026-11-17: the same nine
names.* `can_view_audit` is research R6's whole visibility rule in one `security definer` function
with an empty `search_path`, and `audit_log_select` calls it — which is why it, and not the eight,
is granted to `authenticated`: a policy is evaluated as the calling role, so that role needs the
call (`20261116062027_audit_log.sql:117-125`, and `20261116062030_audit_triggers.sql:103` names it
as the one exception to revoking every `private` function by name). Nine `private` functions are
executable by `authenticated` in all; the other eight come from feature 001 (`current_role`,
`is_admin`, `is_approver`, `validate_request`, `available_balance`, `count_working_days` and the
two calendar enqueue functions). That nine did not become ten when `audit_backfill` arrived is the
grant list, not luck: the migration revokes it from `public, anon, authenticated, service_role`
(`20261117022917_audit_backfill.sql:176`), so `has_function_privilege` still reports nine — worth
checking with that function rather than by name, because a name that contains `audit` says nothing
about who may call it.

Eight rows was the answer until A038 merged. Its migration adds the eighth name, so a stack built
from `feat/303-audit-backfill` — deleted on merge, it is `706e6db` now — reported nine about twenty
minutes before `main` did. On one stack
that several sessions share, that lag is the normal state rather than a fault: count the rows, then
check `supabase/migrations` on the tree the stack was actually built from — and
`select version from supabase_migrations.schema_migrations order by version desc limit 1` says
which migration the stack really has — before filing the difference as a broken build.

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

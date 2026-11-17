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

*Measured 2026-11-17, re-read from the CI `db` job on `main` at `1aba947` (run 44094580416).*
`db:reset` applies every file in `supabase/migrations` — 32 today, the newest
`20261117031500_audit_allowance_swap.sql` — and then prints
`no files matched pattern: supabase/seed.sql`; that warning is normal, there is no seed
file; the reference data comes from a migration. `db:test` runs 64 files / 712 assertions and
passes. The A080 walk measured 62 / 663 on `7857562` and each move since is traceable to one merge,
because each was read off a run whose head differs from the previously measured one by one change:
the extra file is `supabase/tests/audit_backfill.sql`, which A034 added and `7857562` did
not have; it came in guarded, so it was 63 / 670 once the slice 2 test work was in (runs
44075317017, 44076678193 — A035 and A036 add cases to two existing files in that window, so the +7
is a group rather than one PR); 63 / 708 from A038, whose only test change was deleting that guard,
so its +38 is the assertions the guard had been skipping; 63 / 711 from A039, which edits four
test files, adds none, and is the only merge between `136c140` (708, run 44081888209) and `15d0725`
(711) that can move a pgTAP count — the other one is this page; `5cc85d0` (#396) rewrote two test
files' setup and left both numbers where A039 put them; `4900c2b` is A051's row 42 — one new file and
one new assertion, because it lands behind the same guard decision 7 in [tasks.md](tasks.md)
describes and its other fifteen wake when A055 creates `public.audit_my_history()`; and the merges
since — `c3d1655` (#394), `232bba9` (#403), `9929928` (#404), `1aba947` (#399), `73db447` (#405) and
`a874808` (#406), six of them at the time of writing and more by the time this is read — add no file
under `supabase/tests`, which is the whole reason the pgTAP pair is still A051's while step 5's unit
and e2e counts are emphatically not.
`git log --oneline --name-only 4900c2b..origin/main -- supabase/tests` is what answers that in one
command: run against the tip above, it prints *nothing*, which is the proof — any merge that moved
the pair would name its file here. Counting the merges by hand is how a sentence like this one
became wrong twice today. `db:lint` lints `extensions`, `private`,
`public` and `tests` and finds nothing.

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

The one thing this page used to have to apologise for is gone. Slice 1 delivered all of the above
**except the allowance comment**: `admin_set_allowance` did not set `away.audit_reason`, so the
entry's `comment` was null and the reason lived only in `allowance_changes.reason`. A039 merged on
2026-11-17 as `65287b6` (#390) and that is no longer the state: the RPC sets the GUC for its own
transaction now, and CI's `db` job on `main` at `1aba947` (run 44094580416) proves it through the
function rather than by hand — `row22_admin_set_allowance.sql:127-143` asserts that a `Long service`
reason arrives as the entry `comment`, that an empty reason straight after it does not inherit it
(R2, the rule this step used to have to take on trust), and that `admin_set_allowance` writes no
`allowance_changes` row at all. `audit_events_allowances.sql` still sets the GUC directly at `:107`
and `:116`, and that is right: those two cases write `allowance_overrides` themselves instead of
calling the RPC, which is the route a migration or a secret-key write takes and the only route left
where a reason can arrive without one.

So a walk of this step today finds **one** entry per allowance change, not two, with the reason in
`comment`. Two ways to be standing in the old state anyway, both worth recognising: a database that
has not been reset since before `65287b6` still holds the double-written rows, and a stack built from
a tree without the migration is still writing them.
`select version from supabase_migrations.schema_migrations order by version desc limit 1` answers
which — it should print `20261117031500` or later. *Measured on this machine 2026-11-17: the shared
local stack printed `20261117022917`, A038's file, which is `main` at `706e6db`. Nothing was broken
there; nobody had re-run `db:reset` since A039 merged, and the same stack still reported the nine
`private` audit functions and `private.log_leave_type_default()` because step 6's count does not
depend on that migration.*

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

**What the `ac:%` equality looks like now.** A039's migration also closed the window that made the
line above fragile, and the three steps are readable in the **Deploy DB** job logs rather than
guessed from merge order: production took `20261116062027_audit_log.sql` and
`20261116062030_audit_triggers.sql` at 01:15:44Z (run 43994137554, which prints both
`Applying migration` lines), the carry-over `20261117022917` at 11:54:34Z (run 44078161722) and the
swap `20261117031500` at 12:34:29Z (run 44084218732). Slices 1 and 2 therefore did **not** reach
production in one `db push` — decision 10 in [tasks.md](tasks.md) names that as the one condition
the equality cannot survive, and the rows it predicted are there: the carry-over passes over every
source row that is not older than a cutoff it reads from the first live entry
(`20261117022917_audit_backfill.sql:40`), so an `allowance_changes` row written after slice 1's
triggers had already fired is un-backfilled by design. `old_rows > backfilled` is therefore the
healthy answer on this database, not a failed carry-over — and because the swap stopped the
double-write, both numbers are now stable and can be read at leisure instead of mid-write. Three
numbers separate the expected gap from a real one:

```sql
select (select count(*) from public.allowance_changes) as old_rows,
       (select count(*) from public.audit_log where source_key like 'ac:%') as backfilled,
       (select count(*) from public.allowance_changes
         where changed_at >= (select min(created_at) from public.audit_log
                              where not is_backfilled)) as newer_than_cutoff;
```

`old_rows - backfilled = newer_than_cutoff` is decision 10 holding. Read it on production, not on a
convenience stack: with no live entries at all the cutoff subquery returns null, `changed_at >= null`
is never true and the third number answers 0 whatever `old_rows` is — measured, the shared local stack
returns `0 | 0 | 0` for this query. A residue above `newer_than_cutoff` is a source row the
carry-over could not place rather than one it chose to skip: both allowance inserts are
inner joins (`20261117022917_audit_backfill.sql:134-137` and `:165-167`), so a row whose
`changed_by`, `user_id` or `leave_type_id` no longer resolves to a live record is passed over in
silence. The part migration B has to answer, and the reason this is on #366 rather than in a tick:
the `reason` of exactly the in-window rows exists nowhere else — their live entries carry a null
`comment`, because the RPC only learned to set `away.audit_reason` in the swap — so A046 dropping
`allowance_changes` deletes that text. Deciding that is Sam's, and it is a schema question, so this
page records the consequence and stops.

## 5. App check

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration   # demo load, reset and remove leave audit entries alone
npm run test:e2e           # My history, Audit page filters, CSV export, access refusal
npm run build
```

*Measured from the CI jobs on `main` at `1aba947` (run 44094580416, 2026-11-17).* These numbers move
with every merge — `git log --oneline -- specs/002-transaction-audit/quickstart.md` shows #387 and
#400 re-pointing exactly these measurements today, and this is the third re-point — so the sentence
below is worth less than the commands that re-derive it:

```bash
gh run list --workflow ci.yml --branch main --limit 1 --json headSha,databaseId,conclusion
gh run view <that run id> --json jobs --jq '.jobs[] | "\(.name) \(.databaseId)"'
gh api repos/igsl-au-samuel/away-lms/actions/jobs/<job id>/logs
```

That names the commit `main` is on and the run that proves it; the run's `unit`, `integration`,
`db` and `e2e` job logs print the four numbers, and the `db` log's `Files=…, Tests=…` line is the
pgTAP pair step 1 asks about. The logs path is `actions/jobs/<id>/logs`; `jobs/<id>/logs` answers
404, and the job id is the `databaseId`, not the `id` those fields print as null. As measured, they
are: unit 24 files, **310 passing and 36 skipped**; integration 13 files, 73 passing — the
`audit_log` snapshots from A032 live there; `db:test` 64 files / 712 assertions; `test:e2e` 43
passing across 14 spec files.

Those four numbers are `main` at `1aba947`, and `main` is not standing still: two merges have
landed on top of it while this page was being rewritten, and their effect is measured on run
44098680427, the run for `a874808`. `73db447` (#405) did not touch `tests/unit/demo-load.test.ts`,
it *created* it — 18 tests in a new file — so unit is now `Tests 328 passed | 36 skipped (364)`
across `Test Files 24 passed | 1 skipped (25)`. `a874808` (#406) then landed A054 as
`tests/e2e/audit.spec.ts`, which is the 15th spec file and answers 43 passed and 3 skipped, because
its three tests are parked behind a guard exactly as A053's were: it walks `src/app` for whichever
`history/page.tsx` exists and skips when none does (`tests/e2e/audit.spec.ts:21-35`), so the file
count step 5 printed an hour ago is only one of the two numbers that move. The pgTAP pair is the one
they did not move — neither merge added a file under `supabase/tests`, so 64 / 712 is still A051's.
Run the three commands above rather than quoting this paragraph.

Quote the job logs, not the tick, while you are there. That `a874808` run went red in `db` with no
assertion having run at all: `error from registry: Rate exceeded` a minute into the job and then
`failed to bind host port 0.0.0.0:55322/tcp: address already in use`, which is a Supabase container
that never started, not a test that failed. `gh run rerun <id> --failed` re-runs only that job and is
what this run needed — attempt 2 passed, and its `db` log (job 134096656962) prints the same
`Files=64, Tests=712 … Result: PASS` that the earlier head printed, so the pair this page quotes never
moved — and it is why a red `db` beside a green `e2e` reads as infrastructure until the log says
otherwise. A page that quotes the four numbers has to say which of them a runner problem can move,
and which of them a merge of this page cannot: `44100534213` is the run for the squash that merged the
previous revision of this file, and it prints the same `328 passed | 36 skipped`, the same 43 passed
and 3 skipped, and the same `Files=64, Tests=712 … Result: PASS` as the test PRs above it.

The e2e pair is the one to read carefully, because its two halves move for different reasons. The
e2e total was 24 on `7857562`, 29 on `e282de2` (run 44080825208), 35 on `c3d1655` (run 44091112491),
41 on `232bba9` and is 43 here. `c3d1655` (#394) added six by turning `tests/e2e/a11y.spec.ts` into
one row per role and per colour scheme plus two error-state audits, without adding a file;
`232bba9` (#403) added six more in a brand-new `tests/e2e/access.spec.ts`, which is what moved the
denominator from 12 to 13; `1aba947` (#399) made it 14 with two reset-link tests; and `a874808`
(#406) is the 15th file while adding nothing to 43, because its three tests are parked until A059
creates the page they load, as the last paragraph of this section says. So neither half of the pair
predicts the other, and an e2e count says nothing about route coverage on its own — the files, or
`npx playwright test --list`, are the thing to read. On the head this paragraph cites,
`npx playwright test tests/e2e/access.spec.ts --list` ends `Total: 6 tests in 1 file`: one
navigation test and one reach/refusal test per role in the matrix at `access.spec.ts:17`.

The unit pair moved on its own, and its skipping is the shape worth learning to read. At `706e6db`
it was 298 passing with **12 skipped**, all twelve in `tests/unit/allowance-log.test.ts`, because
A037 had written its mapper tests against a module that did not exist yet and parked them behind
`describe.skipIf(!mapperLanded)` and an `@ts-expect-error` on the import. A040 landed
`src/server/allowance-log.ts` and deleted both in the same commit (`e282de2`), which is the pairing
to remember when reading any of these notes: the parked test and the parked typecheck error are one
change, and landing only one of them reddens either the suite or `npm run typecheck`. `9929928`
(#404) did exactly that again for slice 3 while this page was being rewritten — it landed at
13:33:38Z, and `1aba947` (#399) four minutes after it: 36 tests parked in a new 24th file,
`tests/unit/audit.test.ts`, behind
`describe.skipIf(!AUDIT_MODULE_LANDED)` where the flag is `existsSync` on `src/server/audit.ts`
(`:45`, `:187`), with the matching `@ts-expect-error` at `:53` and a header note that A056 deletes
both in one commit. So `310 passed | 36 skipped` is slice 3 being honest about not existing, not a
suite that lost tests; `Test Files 23 passed | 1 skipped (24)` names the file to look at. That pair
moved again afterwards without a second guard arriving: on `a874808` the same two lines read
`328 passed | 36 skipped` and `24 passed | 1 skipped (25)` — one whole file and eighteen real tests
heavier, and still the same thirty-six parked, which are all A053's.

`test:e2e` still runs none of `/history` or `/admin/audit`, and the two halves of that are different
failures to diagnose. On `1aba947` there was no spec for either; since `a874808` there is a
`tests/e2e/audit.spec.ts` with exactly the three my-history tests this section wants, and Playwright
skips all three because `test.skip(HISTORY === "", …)` at `tests/e2e/audit.spec.ts:35` finds no
`history/page.tsx` anywhere under `src/app` — A059 owns that page, and the guard derives the route
from the file system rather than hard-coding `/history`, because A060's fallback says `/me/history`
and a typed string would have stayed skipped after the page arrived one directory over. Nothing in
`tests/e2e` visits `/admin/audit` — not even `admin.spec.ts`, which stops at `/admin/users`,
`/admin/demo` and `/admin/leave-types` — because that half is A067, which extends this same file in
slice 4. A walker who sees `3 skipped` in the e2e output is looking at slice 3 being unbuilt, not at
a broken test — the same reading the paragraph above makes of `36 skipped` in unit, at the other end
of the same decision 7. So the two comments above,
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

A039's migration is the 32nd file and moves neither count. It redefines `public.admin_set_allowance`
— a `public` function, so invisible to a `private` inventory — and drops
`private.log_leave_type_default()`, which is the only `private` function this feature has removed.
That drop cannot shift either number: the name never matched `%audit%`, and
`has_function_privilege('authenticated', 'private.log_leave_type_default()', 'execute')` answered `f`
on the stack this page measured on 2026-11-17, so it was already outside the executable nine. The two
signs a stack has the swap applied are `20261117031500` at the top of
`supabase_migrations.schema_migrations` — step 2 prints that query — and
`select exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'log_leave_type_default')`
answering `f`, which the `%audit%` listing above cannot show because the name never matched it.

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

A third thing a migration can break, which only became possible with the A039 swap: a function that
redefines `public.admin_set_allowance`, or any `security definer` RPC that writes an audited table
for a caller, has to keep the `set_config('away.audit_reason', coalesce(p_reason, ''), true)` that
precedes its write (`20261117031500_audit_allowance_swap.sql:46`). Drop that line and nothing errors
— the entry still lands, with `comment` null — and because the swap stopped writing
`allowance_changes`, the reason now exists nowhere else to be noticed. The `coalesce` to `''` is not
decoration either: it clears a value an outer transaction left behind, which is R2's rule.

`alter table … disable trigger`, and dropping or recreating a trigger, are not ways to
satisfy this note: they change what the log promises for the rows written around them.
The exception is a migration that alters `audit_log` itself and so has to drop
`audit_no_update_delete` or `audit_no_truncate` to do it — the immutability trigger's own
detail message allows exactly that. Such a PR says so and is reviewed as a protected-area
change.

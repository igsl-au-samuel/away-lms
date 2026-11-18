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
  **Right now the answer to "should I reset it" is no, and not because the page is cautious.**
  Orchestration ruled `db:reset` off on #361 at `2026-11-17T21:52:38Z`, after session 3 had held the
  stack since `14:47:01Z` and released it untouched at `21:50:33Z`. The permission it had been given
  was conditional on the other lanes not objecting, and nobody posted one — silence is not a yes. The
  technical reason is [#214](https://github.com/igsl-au-samuel/away-lms/issues/214), still open:
  `loader.loadDemo` calls `removeDemo` *before* rebuilding
  (`src/server/demo/loader.ts:150`), and a reset is 42 subrequests against the Workers Free limit of
  50 (`:157-158`; 36 on a first load, then one per demo user deleted). A failure in the middle of
  that leaves the shared volume with the old roster deleted and the new one half-built — and, which
  is the part that costs the most signal, `db:reset` replays migrations from the *checked-out tree*,
  so resetting from a stale branch restores the stale schema and reports a clean run. #405 (`73db447`)
  made such a failure legible — `loadDemo` now logs `loader.demoLoadStage(error)` at
  `src/actions/demo.ts:27` — but legible is not atomic, which is why #214 is still open. A reset
  needs that closed and someone watching the post-state, not because the volume holds anything
  irreplaceable: session 3 measured that stack's `audit_log` read-only at `21:41:46Z` as 348 rows,
  all `is_backfilled = false` with `source_key` NULL, which is the designed shape of a live trigger
  write (`supabase/migrations/20261116062027_audit_log.sql:44`) and test noise besides — A045's real
  comparison was against the hosted database, and [tasks.md](tasks.md) decision 10 records it. The
  narrower fix for a lagging ledger is step 7's `npx supabase db push --local`, which is additive —
  and `--local` is the whole of the difference between repairing this volume and migrating production.
- Local seed users: `npm run seed:local -- --password <pw>` creates **four** accounts — one admin,
  one manager, two employees (`scripts/seed-local.ts`). Reference data (leave types, holiday
  regions) arrives with the migrations, but a reset empties `profiles` and the auth users, so
  steps 2, 3 and 5 need the reseed first.

## 1. Database tests

```bash
npm run db:reset           # applies migrations — the A038 backfill is in this line now, and
                           # finds no history to carry on a reset stack (see step 4)
npm run db:test            # pgTAP: rows 28-40 and row 42 today, row 41 is A063 in slice 4;
                           # plus the events and behaviour files
npm run db:lint            # function search_path, and tables exposed without RLS
```

Expected: all green. The existing 001 tests pass unchanged (SC-009).

*Measured 2026-11-18, re-read from the CI `db` job on `main` at `2e2fb77` (run 44211491754, job
134493009911): **`Files=62, Tests=693 … Result: PASS`**. That pair has changed once and held for two heads
since. It had stood at `Files=64, Tests=728` through six anchors and five moves of the tip, and `6be1239`
(**#422**, slice 2b) is the merge that ended it — two test files deleted and five narrowed, the number
moving for the first time in the *decreasing* direction. That is still the expected shape, only on the
other side of it. It is not inferred from a file list: the paragraph after this one is where the file-list
inference was tried, and `69cd47d` disproved it within one merge. What #422 disproves is a stronger form
of the same inference — this is the first move in the window that a file *disappearing* explains, and
`--diff-filter=A` cannot see that; see the deletion note in [tasks.md](tasks.md). The two heads above it
are a UI merge and a docs merge, and both leave pgTAP alone — `git diff --name-only 6be1239..2e2fb77 --
tests supabase/tests` prints exactly the two e2e spec files #424 edited and nothing under `supabase/tests`,
which is the claim, and the three identical `Files=` lines at `6be1239`, `ace715e` and `2e2fb77` are the
proof: identical numbers at three heads is a measurement, a carried-forward pair is not.*
`db:reset` applies every file in `supabase/migrations` — 34 of them at this head, the newest
`20261118020000_drop_allowance_changes.sql`, which is A046's drop and the thirty-fourth file —
and then prints
`no files matched pattern: supabase/seed.sql`; that warning is normal, there is no seed
file; the reference data comes from a migration. `db:test` runs 62 files / 693 assertions and
passes. The A080 walk measured 62 / 663 on `7857562`, so the file *count* has come back to where that
walk found it while the file *set* has not: the 62 on the tip contains `audit_backfill.sql` and
`row42_audit_my_history.sql` and lacks `row23_allowance_changes_select.sql` and
`row24_allowance_changes_no_direct_write.sql`, and each move since is traceable to one merge,
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
describes and its other fifteen were still sleeping; the six merges after it — `c3d1655` (#394),
`232bba9` (#403), `9929928` (#404), `1aba947` (#399), `73db447` (#405) and `a874808` (#406) —
touched no file under `supabase/tests` at all, which is why 712 sat still across all of them; then
`69cd47d` (#382's row21 sweep, the last piece of #382 and lane 3's, not this session's) made it
**713 without creating a file**: `plan(6)` became `plan(7)`; three
`select is((select count(*)::int from public.allowance_overrides), 3, …)` became counts scoped to
the leave type that file creates and rolls back; the inactive-user zero stayed unscoped, because a
role denied every row holds whatever else the stack happens to hold; and the one read-back check
became two — the row count against what the file itself saw, then a `md5(string_agg(o::text, …))`
over those same rows, so a reader cannot silently rewrite one and still report "rows are intact".
Then `8450da9` (A055, **#407**) deleted row 42's guard, fifteen assertions ran for the first time in
the feature's life, and the pair became **64 / 728**: 713 + 15, one merge that added no test file
either. And then `6be1239` (**#422**, slice 2b) went the other way, to **62 / 693**, and it is the first
move in this window that *removes* something rather than adding to something. `drop table
public.allowance_changes` at `20261118020000_drop_allowance_changes.sql:178` makes the two files that
tested that table pointless, so `row23_allowance_changes_select.sql` and
`row24_allowance_changes_no_direct_write.sql` were deleted with `plan(7)` and `plan(12)` in them, and
five surviving files dropped the assertions that counted rows in the gone table —
`audit_backfill.sql` 39 → 28, `audit_events_leave_types.sql` 16 → 14,
`audit_events_allowances.sql` 14 → 13, `leave_type_default_log.sql` 13 → 12,
`row22_admin_set_allowance.sql` 17 → 16. Those seven moves come to −35 and 728 − 35 is 693, which is
the same kind of arithmetic check the e2e `Running N` header gives: a `Tests=` that was silently losing
assertions it should have kept would not reconcile like that. What *traceable to one merge* has to mean,
then, is that every move maps to a merge, not that every merge adds or removes a predictable number of
files — the two moves before this one both changed a file that was already there, and the docs page
merged between them said 712 for both of them.
`git log --oneline --name-only 4900c2b..origin/main -- supabase/tests` used to be offered on this
page as a one-command proof of the pair. Run it against the tip above and it prints **three commits and
nine file lines** — `6be1239` with seven of them, `8450da9` with `row42_audit_my_history.sql`, `69cd47d`
with `row21_allowance_overrides_select.sql` — where the same range re-run against `a874808`, the head
that revision was measured on, printed nothing at all, which is exactly what the page recorded as its
proof. It has a second failure now, one this page did not expect: two of the nine paths it prints no
longer exist. `--name-only` does not distinguish a deletion from an edit, so the command names
`row23_allowance_changes_select.sql` and `row24_allowance_changes_no_direct_write.sql` in a list whose
natural reading is "files you can open". Keep running the command, but for what it actually
answers, which is *which test paths have been touched since*; "and therefore the assertion count cannot
have moved" was never inside it, and the sentence that said it
was merged at `1e9bfe6` carrying the number `712` in five places — three of them as statements about
the current head, the other two correctly dated to runs that really did print 712 — while the run for
that very commit (44104832250, job 134114225446) printed `Files=64, Tests=713 … Result: PASS`. The
numbers were re-measured at merge and the reasoning beside them was not, which is how a page written
against one head reads as a claim about every head after it. `db:lint` lints `extensions`, `private`,
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
which — it should print `20261117031500` (A039's swap) or later, and the newest file on `main` as this
was written is `20261117140000`. *Read on this machine at `2026-11-17T22:05:25Z` the shared stack
printed `20261117022917`, A038's file — the second case live, two migrations short of its own tree.
Step 7 records what closed it; re-read at `22:28:53Z` the query prints `20261117140000`, and a walk
today finds one entry per change with the reason in `comment`.*

A lag is not "nothing broken", and what it costs is worth naming while one is open: the stack keeps
`private.log_leave_type_default()` and the pre-swap `admin_set_allowance`, so
`tests/e2e/admin.spec.ts:66` is red locally and green in CI, and a full local `npm run db:test` is a
pre-swap result rather than a pass. Step 6's nine executable `private` functions detect none of it —
`log_leave_type_default()` was already outside that count — so a nine on a lagging stack is neither
evidence the swap landed nor evidence of a broken build. Count the ledger against the files: that is
the check, and step 7 is the repair.

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
with every merge — the same `git log` shows #387, #400 and #402 re-pointing exactly this sentence
within two hours of each other on 2026-11-17 (`15d0725` 22:33, `023e3d4` 23:21, `abdab23` 00:12, all
`+10:00`), and there is no keeping-up-to-date to be done here except replacing the sha and the run id
— so the sentence below is worth less than the commands that re-derive it:

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
`history/page.tsx` exists and skips when none does (`tests/e2e/audit.spec.ts:21-35`), so the 14-file
count this step printed for `1aba947` is only one of the two numbers that move. The two runs behind
those readings are twenty-four minutes apart — `44094580416` created at `13:37:26Z`, `44098680427` at
`14:01:45Z` — which is how long `main` took to move out from under the readings one paragraph above.
The pgTAP pair did not
move for *those two* merges — `git log --oneline --name-only 4900c2b..a874808 -- supabase/tests`
prints nothing — but the sentence this page then wrote about the reason was wrong, and
the very next merge proved it: `69cd47d` (#408) took 712 to 713 by editing one existing test file,
and `8450da9` (A055, #407) took 713 to 728 by deleting row 42's guard without adding a file either.
Step 1 carries the full trace and the corrected reading of that command; what belongs here is the
tip as measured, because none of the heads above is it any more.

Run 44211491754 — `main` at `2e2fb77` (**#426**, a docs squash: this spec's A082 note and the ROADMAP's
Polish paragraph), created `00:53:26Z` on 2026-11-18 and concluded `success` at `01:00:22Z` — is the answer
as this line was written: `db` → `Files=62, Tests=693 … Result: PASS` over 34 migrations, with `No schema
errors found` from the lint step (job 134493009911), `unit` → `Tests 365 passed (365)` over `Test Files 25
passed (25)` (job 134493011754), `integration` → `73 passed (73)` in 13 files (job 134493077986), `e2e` →
**`51 passed (48.2s)`**, no `skipped` line anywhere, under a `Running 51 tests using 2 workers` header at
`00:56:35Z` (job 134493013136, summary at `00:57:09Z`).

Four pairs, one head, every one of them on the first attempt — and that is the difference between this row
and the one above it, because `ace715e` needed a second job to print its e2e number at all. `ace715e`'s
run 44208816296 has two `e2e` jobs, and the reason belongs on the page beside the number. The first
(134481628216) concluded `failure` at `00:37:18Z` having never run a test: its log ends with eighteen
copies of `Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` from
the dev server for `./src/app/layout.tsx`, and Playwright's own line is `Error: Process from
config.webServer was not able to start. Exit code: 1`. Nothing asserted anything, in either direction — no
pass, no fail, no count. A failed-job-only rerun of that run was in flight from elsewhere on the repo before
this lane's own `gh run rerun 44208816296 --failed` could start one — it answered `cannot be rerun; This
workflow is already running`, and the correction saying so is comment 6965395529 on
[#361](https://github.com/igsl-au-samuel/away-lms/issues/361) — so 134484448278 (`51 passed (42.2s)` at
`00:43:09Z`) is the reading for `ace715e`, cited as a job and not as a hand. Two consequences a walker
should carry: a run id can span two different jobs for the same check, so cite the **job** id with a count
and not the run alone; and the same error line reached lane 1's PR run 44208228721 (e2e job
134479614949, its own error line at `00:32:30Z`) just under five minutes earlier, which is how you tell an
infrastructure red from a red about the branch — the first has no summary lines at all. The third
consequence is what the tip's row adds: the red was retired by the next merge printing the same header on
its first attempt, not by the rerun.

All four pairs are the numbers of the row above, which no head in this table managed before: the merge that
made this tip changed no test, no migration and no guard, so two runs agree where a diff alone would only
have predicted it. The `7e24bbb` row is the same control one head-set earlier, and the command that proves
each of them is written beside its own row.

Nine measured heads carry this paragraph inside one evening, and the table is the reason it points at
runs instead of quoting itself:

| head | run, created | pgTAP | unit | integration | e2e |
| --- | --- | --- | --- | --- | --- |
| `3ac356a` | 44106630834, `14:45:36Z` | 64 / 728 | 328 + 36 skipped, 24 + 1 skipped files | 73 / 13 | 43 + 3, 15 files |
| `e70838b` | 44188157874, `22:15:01Z` | 64 / 728 | 328 + 36 | 73 / 13 | 45 + 3, 15 files |
| `f8472a1` | 44195402808, `23:00:17Z` | 64 / 728 | 328 + 36 | 73 / 13 | **47** + 3, 15 files |
| `6fe8763` | 44196688168, `23:08:33Z` | 64 / 728 | **365 + 0, 25 files** | 73 / 13 | 47 + 3, 15 files |
| `6e78d48` | 44197900132, `23:16:25Z` | 64 / 728 | 365 + 0 | 73 / 13 | **48** + 3, 15 files |
| `7e24bbb` | 44200421071, `23:33:35Z` | 64 / 728 | 365 + 0 | 73 / 13 | 48 + 3, 15 files |
| `6be1239` | 44204725101, `00:04:12Z` | **62 / 693**, 34 migrations | 365 + 0 | 73 / 13 | 48 + 3, 15 files |
| `ace715e` | 44208816296, `00:33:41Z` | 62 / 693, 34 migrations | 365 + 0 | 73 / 13 | **51 + 0**, 15 files |
| `2e2fb77` | 44211491754, `00:53:26Z` | 62 / 693, 34 migrations | 365 + 0 | 73 / 13 | 51 + 0, 15 files |

Every run id in that table is a `push` run whose `head_sha` *is* the main commit — `gh run list --branch
main --event push` prints all nine — which is why no row here needs an argument that a merge ref stands in
for a tree. The runs quoted from the other two lanes further down this page are `pull_request` runs against
a merge ref, and say so; `44195296593`, `44195355766` and `44196190438` show that a push run is not a
guarantee either, because those three are push runs and all three are cancelled.

The `7e24bbb` row is the page's cleanest control, because it is a docs merge: **#420**, *name the
agent by what it is, not by which product shipped first*, and `git log --name-only 6e78d48..7e24bbb`
prints `CLAUDE.md` and `docs/TEAM.md` and nothing else. A head that names no test file, no migration and
no guard cannot print a different pair, which is the one claim about the moving tip this page can make
from a diff rather than a log — and the inference was checked rather than trusted. `7e24bbb`'s run was
still in progress when it was first read at `23:34:14Z`; it finished seven for seven at `23:37:53Z` and
printed exactly the four numbers in its row, which is what the diff predicted. So the two halves of a
docs head are both on the page: it inherits its *numbers* from the tree under it, and it is *evidence*
only for itself, which is why this table carries one row per head instead of one row marked "and
everything after". The tip row is that rule applied a second time, and this time to a merge this lane wrote
itself: `2e2fb77` is **#426**, `git diff --name-only ace715e..2e2fb77` prints two files and neither is a
test or a migration, and its four numbers are `ace715e`'s — which is what a control predicts, and still not
what the reader is asked to take on faith, because the row carries its own run id. Two adjacent rows that
differ only in the head and the run is the table saying the same thing twice on purpose.

The `6be1239` row breaks the control, and that is the part worth carrying. `6be1239` (**#422**, slice
2b) is the first head in this table whose pgTAP pair moves, and it moves by *subtraction*: two test
files deleted,
five narrowed, one migration added, one table dropped. Every count on this page has so far gone up, so
the failure mode a reader has been trained on is "a number moved and no file appeared"; the failure mode
here is its mirror, "a file *disappeared* and the command that lists files still just lists it" — see the
`--name-only` note in step 1. And the diff still cannot be read as the other three pairs, in the other direction: `demo-reset.test.ts`
gained 17 lines and `admin.spec.ts` lost one, and seventeen lines into an integration file is exactly what
a new test looks like. The diff does add no `it(` or `test(` call, which is evidence of a kind — but
integration prints `73 passed (73)` and e2e prints `48 passed` with `3 skipped` on their own jobs above,
and a count on this page is a line in a log, not a reading of a diff. That is the whole reason the table
has a row per head rather than a sentence about the last one.

The `ace715e` row is that lesson in its least visible form. `ace715e` (**#424**, slice 3) moved one pair
and moved it entirely inside the split — e2e `48 + 3` → `51 + 0` with the collected total unchanged, because
`Running 51 tests using 2 workers` prints the same here as at `6e78d48`, `7e24bbb` and `6be1239` above it,
and the same again at `2e2fb77` below it. It is
`6fe8763`'s unit shape arriving in e2e: the guard at `tests/e2e/audit.spec.ts:35` is *still in the file*,
and what woke it is a page the guard walks for, not an edit to the test. And the merge's second test
file is the one no number in this table can report at all. `a11y.spec.ts` gained `/history` in three
seeded-role `paths` arrays (`+3/-3`, written `test(` count 4 before and after), and since the axe loop
iterates `paths` *inside* one test per role per colour scheme
(`tests/e2e/a11y.spec.ts:51-57`), six tests now each walk one more route with every count flat. That is
#419's discovery read from the other side: there, paths left a loop and coverage moved while `Files=`
held; here, paths entered a loop and coverage moved while *all four pairs* held. A walker who compares
totals across this merge concludes that a11y is untouched, which is the opposite of what happened.

This page's own previous revision is the counter-example worth having. #414 read its four pairs off run
44188157874 at `e70838b`, published them as "the answer as this line was written", and merged at
`23:08:30Z` — three minutes and twelve seconds after `817e3bb` woke unit's 36 at `23:05:18Z`, and nine
minutes after `a7c9fdf` took e2e to 47 at `22:59:32Z`. So the sentence landed on `main` with two of its
four pairs already false: its own head printed `365 passed (365)` (job 134440019753) where the paragraph
printed `328 passed | 36 skipped (364)`, and `47 passed` (job 134440019579) where the paragraph printed
45 — and no check could have said so, because #414 touched nothing but markdown and a docs diff cannot
redden a suite. The remedy is procedural, and it is why this paragraph moves again rather than being
written once well: re-read against the tip at *push* time, name the head the run belongs to, and prefer
the commands above to the prose below them.

Most of the elapsed time sits in the first gap, because the walk happened the next morning; the runs
behind the other four are forty-five minutes, then eight, then eight, then seventeen. Two of the four
pairs moved across the six rows — e2e three times, unit once, pgTAP and integration not at all — and every move is
for a reason a file list cannot see. e2e went 43 to
**45** at `342edc3` (#415), which added **one** `test(` call to `tests/e2e/a11y.spec.ts` inside
`for (const scheme of ["light", "dark"])`, so one call became two tests: 78 insertions and one
deletion, one existing spec, still 15 files. It went 45 to **47** at `a7c9fdf` (#418), which added
**two** plain `test(` calls, unindented, to an existing `tests/e2e/mobile.spec.ts` — 59 insertions in
that file, no new file — and each became exactly one test. A walker who derives the e2e total from a
diff has to know both shapes, and the second only shows up when the pattern allows an unindented
`test(`: counting #418's added calls with a pattern that required indentation read zero.

It went 47 to **48** one merge later, at `6e78d48` (**#419**), and that step is the one a count cannot
describe. Same file again, `tests/e2e/mobile.spec.ts`, 28 insertions and one deletion, still no new
file: one `test(` added — "the admin pages are usable at 390 px with no page-level horizontal scroll" —
and two paths *taken out* of the loop inside the existing test, `[ "/", "/approvals", "/admin/users",
"/admin/demo" ]` becoming `[ "/", "/approvals" ]`. The count moved by one; the routes that file
measures did not move at all, because the new test visits the two the loop lost, signed in as an admin.
What changed is what is measured: admin pages do not redirect a non-admin, `getAdminViewer()` answers
null unless `role === "admin"` (`src/server/auth.ts:45`, the function at `:43`) and the page returns
`<Forbidden />` at the
same URL under a layout that still renders `main`, so a manager-loop pass over `/admin/users` had been
asserting that a three-line error card does not overflow at 390 px. `48` cannot tell you that, and
neither can `15 files` — which is the reason this section keeps saying the spec files, or
`npx playwright test --list`, are the thing to read rather than the total.

The remaining move is the one this page has been predicting since A053 landed, and it happened eleven
minutes before `6e78d48`: unit went `328 passed | 36 skipped (364)` to **`365 passed (365)`** at
`817e3bb` (A056,
**#411**), and no file appeared to do it. That commit edits one existing test file — `30` insertions
and `11` deletions in `tests/unit/audit.test.ts` — and the two halves of the move are in that one edit:
A053's `describe.skipIf(!AUDIT_MODULE_LANDED)` and the matching `@ts-expect-error` were deleted, which
is the 36 becoming 36 *run* rather than 36 *skipped*, and one `it(` was added — "names the requester
when no signed-in person wrote the submission, and the actor when one did", the 37th assertion — which
is why the total is 328 + 37 = **365** and not 364. `Test Files` stayed at 25; what moved is the split
inside it, `24 passed | 1 skipped` to `25 passed`. So the denominators in this table are the least
informative numbers in it: the pgTAP `Files=64`, the e2e `15 files` and unit's `25` all survived six
heads while two of the four pairs moved underneath them — four times between them. Two of those three are printed by the job and
one is not: Playwright's summary line says nothing about files, so `15` is
`git ls-tree -r --name-only origin/main tests/e2e | grep -c "spec.ts$"` at that head — which is the
same reason the section below tells you to read the spec files or `--list` rather than the total.

What A055 did to pgTAP is the same shape one level down: it moved the count by deleting row 42's guard
rather than by naming a new file, because the merge that moves a total here is the one that changes
*what an existing file is allowed to run*. Both parked halves have now woken that way. `817e3bb` took
unit's 36 with it, guard deleted from inside the existing file, nothing added to the file count. The
e2e half woke at `ace715e` (**#424**, *feat: My history page (slice 3) — rebased, supersedes #413*,
merged `2026-11-18T00:33:38Z`), and it woke without its guard being edited at all: `git show
origin/main:tests/e2e/audit.spec.ts | grep -c "test.skip("` still answers 1, because the sentence at
`tests/e2e/audit.spec.ts:35` is still in the file, and what changed is the thing it looks at — `git
ls-tree -r --name-only origin/main src/app` now prints `src/app/(app)/history/page.tsx`, where the same
command printed nothing at `6e78d48`. That is decision 7's point stated as a measurement: a woken guard
can leave its own line behind, and only the split inside the denominator moves.

The same merge then did something none of the four pairs can see. `a11y.spec.ts` gained `/history` in
three seeded-role `paths` arrays — `git show ace715e -- tests/e2e/a11y.spec.ts` is three `+3/-3` lines
and `grep -c "/history"` goes 0 → 3 — but the axe loop walks `paths` *inside* one test per role per
colour scheme (`tests/e2e/a11y.spec.ts:51-57`), so six tests each visit one more route while the
written `test(` count stays at 4 and the collected total does not move at all. A walker diffing
`Running` across this merge would report that a11y coverage is untouched. It is the widest coverage
change slice 3 made.

The PR that carried this page for most of the evening was **#413** (head `5dd94ea`), and the way it
stopped mattering is the part worth keeping. Measured at `23:13:37Z`, `23:35:51Z` and `00:20:59Z` it
answered `CONFLICTING`/`DIRTY` with all nine contexts `SUCCESS` against its own head, and
`git merge-tree --write-tree origin/main 5dd94ea` named exactly one file —
`specs/002-transaction-audit/tasks.md`, one docs status file, while the page, the component, the server
module and both test files it carried merged clean. Nothing happened to that branch in between. Then
the same content arrived from the other side: #424 merged the identical `A057`–`A062` ticks that #413's
copy of the file also contained, and #413's mergeability flipped without anyone touching it — measured
at `2026-11-18T00:43:22Z` it answers `MERGEABLE`/`CLEAN`, `git merge-tree --write-tree origin/main
5dd94ea` reports 0 `CONFLICT` lines where the same command against `6be1239` reports 1 (`5dd94ea` is still
reachable after the close, through `git fetch origin refs/pull/413/head`), and fifty-three seconds later its
author closed it — `state: CLOSED`, `mergedAt: null`, `closedAt: 2026-11-18T00:44:15Z`. That ordering is the
lesson: the flip made the branch mergeable, and only the author could end it, so a readiness check that had
been reporting a refusal for three hours went quiet on its own and the bookkeeping stayed a human step. So the
refusal a readiness check reported for three hours was dissolved by somebody else's merge rather than
by a rebase, which is the same lesson the `UNKNOWN` readings beside it carry from the other direction: a
minute before the third measurement the query answered `UNKNOWN`/`UNKNOWN`, which is GitHub recomputing
after a push, not a third state — `UNKNOWN` means *not yet known*, so a check that reads it as either a
green light or a refusal is reading its own timing as a fact about the branch.

The command that finds sleeping guards gained a second false positive in the same commit that woke the
first one. It prints the same three names at the tip that it printed at `6fe8763` and at `6e78d48`, and
one of them has changed kind in between. That is a re-measurement rather than an inheritance, because
`6be1239` deleted two files out of the very directory this command walks — and neither of them carried a
token, which is why the list is the same length and not two shorter:

```
$ grep -rl -e skipIf -e 'test.skip(' -e to_regprocedure tests/unit tests/e2e supabase/tests
tests/unit/audit.test.ts                       <- false positive: the word survives only at :10, in the
                                                   comment that records the skipIf's own removal; the
                                                   file now runs all 37 of its tests
tests/e2e/audit.spec.ts                        <- the one sleeping guard left: `test.skip(HISTORY ===
                                                   "", …)` at :35, three tests, A059's page
supabase/tests/audit_events_leave_types.sql    <- false positive: A039's negative assertion that
                                                   private.log_leave_type_default() is gone
```

A guard that sleeps on a TypeScript module and a guard that sleeps on a migration are the same
decision 7 in two different languages, and they wake separately. A grep for the word that used to be
the guard finds both the sleeping one and the wake note, so it is a list of files to open, not a count
of tests still parked.

Run the three commands above rather than quoting this paragraph. Its own expiry is worth having seen,
though, and so is the way it expired four more times in the next hour. The run for `342edc3` —
44188036354, created `22:14:18Z`, three seconds after that squash, which was itself forty-two seconds
before `e70838b`'s — never printed 45 at all, because `ci.yml:8-10` sets `group: ci-${{ github.ref }}`
with `cancel-in-progress: true`, so all seven of its jobs were cancelled between `22:15:15Z` and
`22:15:17Z`, and the number first appears on the head after it. "The run for a sha" and "the run whose
log proves that sha's counts" are two different phrases, and only one of them survives a push.
Orchestration turned that into a merge rule on #361 at `22:49:12Z`, half an hour after those two merges
landed 42 seconds apart: *"main is green" means the check runs for the current tip COMPLETED
successfully — `completed/cancelled` is not a pass, and after any two merges closer than one CI run the
earlier commit carries no evidence at all.* Everything below was measured after that rule was written,
which is the only reason it is evidence rather than prediction.

Two merges twenty-five seconds apart — `a7c9fdf` (#418) committed `22:59:32Z`, `126a346` (#417) at
`22:59:57Z` — then lost all fourteen of their jobs to the same clause: `44195296593` and
`44195355766`, created `22:59:36Z` and `23:00:00Z`, each conclude `cancelled` with every job
`cancelled`, and the run created twenty seconds after the second of those squashes — `f8472a1`'s,
`44195402808` at `23:00:17Z` — is the one that survived to finish. So the e2e step
from 45 to **47** never printed on the head that made it either, and the 47 above belongs to
`f8472a1`'s run. The fourth instance is
the one that qualifies the rule rather than repeating it: `44196190438`, the run for `817e3bb` (A056),
concludes `cancelled`, but only two of its seven jobs were cancelled — `integration` and `e2e`, both at
`23:08:47-48Z`, under twenty seconds after `6fe8763`'s squash at `23:08:29Z`. Its `unit` job finished
green first, at `23:06:43Z` (job 134438155651), and it prints `Tests 365 passed (365)` over `Test Files
25 passed (25)`, so the waking of A053's 36 *is* provable from its own head — in one of the four pairs,
in the run whose overall conclusion is not a pass. Read the job table, not the run conclusion, and say
which of them a number came from: a cancelled run can carry a completed job, and the two readings give
different answers about the same merge.

Quote the job logs, not the tick, while you are there. That `a874808` run went red in `db` with no
assertion having run at all: `error from registry: Rate exceeded` a minute into the job and then
`failed to bind host port 0.0.0.0:55322/tcp: address already in use`, which is a Supabase container
that never started, not a test that failed. `gh run rerun <id> --failed` re-runs only that job and is
what this run needed — attempt 2 passed, and its `db` log (job 134096656962) prints the same
`Files=64, Tests=712 … Result: PASS`, the same pair every head from A051's onwards had printed, so
nothing in it moved between the attempts — and it is why a red `db` beside a green `e2e` reads as infrastructure until the log says
otherwise. A page that quotes the four numbers has to say which of them a runner problem can move,
and which of them a merge of this page cannot: `44100534213` is the run for the squash that merged the
previous revision of this file, and it prints the same `328 passed | 36 skipped`, the same 43 passed
and 3 skipped, and the same `Files=64, Tests=712 … Result: PASS` as the test PRs above it. That last
clause is the trap, though, and the next docs squash sprang it: `44104832250` merged *this* file's
revision and printed **`Files=64, Tests=713`**, not because a docs change moves a pgTAP count — it
cannot, and did not — but because the head it created already had #408 under it. A docs merge moves
nothing; the *tip it lands on* moves whatever test PR merged in the interval, which is precisely why
the four numbers are dated and tied to a run id, and why step 1's file-list command cannot be used to
predict a count at all.

The e2e pair is the one to read carefully, because its two halves move for different reasons. The
e2e total was 24 on `7857562`, 29 on `e282de2` (run 44080825208), 35 on `c3d1655` (run 44091112491)
and 41 on `232bba9`; then 43 passed with nothing skipped on `1aba947` (job 134078211226), 43 and 3
skipped on `a874808` (job 134096720980) and again on `3ac356a` (job 134120806513), **45 and 3** on
`e70838b` (job 134410263651), **47 and 3** on `f8472a1` (job 134435425099) and again on `6fe8763`
(job 134440019579), **48 and 3** on `6e78d48` (job 134444052037), on `7e24bbb` (job
134452766151) and on `6be1239` (job 134467615728) — and that last one earns its place, because
`6be1239` is the only merge in this window that touches `tests/e2e/admin.spec.ts` at all, and the pair
held anyway: what it changed there was one `allowance_changes` cleanup statement inside a test that is
still one test. The pair then stopped being a pair: **51 passed and no `skipped` line anywhere** at
`ace715e` (job 134484448278, `51 passed (42.2s)` printed `00:43:09Z`), because the page those three
tests load finally landed. Five merges touched something under `tests/e2e`; four of them moved this pair
and the fifth did not, and which was which is a job log, not a file list — and of the four movers, three
added calls and the fourth added none. The three merges that carried those added calls, and nothing else
did, are `342edc3`'s (#415), which wrapped a single `test(` call in
`for (const scheme of ["light", "dark"])`: 78
insertions and one deletion in one existing spec, one added `test(` line, two added tests —
`a7c9fdf`'s (#418), which added two plain `test(` calls, unindented, to `tests/e2e/mobile.spec.ts`:
59 insertions in that file, two added lines, two added tests — and `6e78d48`'s (#419), one added
`test(` and two routes deleted from a loop in the same file: 28 insertions and one deletion.
Two steps of +2 and then a step of +1, all three in existing files, all three with the skipped half
unmoved at 3, and three different reasons: a loop that runs twice, two calls written out, and one call
written out beside two paths taken away. The fourth mover is the mirror of all three: `ace715e` added no
`test(` call and did not touch the guard's own line (the `test.skip(HISTORY === "", …)` at
`tests/e2e/audit.spec.ts:35` is byte-identical before and after — the merge's two hunks in that file open
at lines 83 and 153),
and it moved the skipped half from 3 to nothing while the collected total held. What that merge also did
to the same file is invisible to every number in this table: three assertions in the cursor-error test
switched from `getByRole("alert")` to `locator(".alert")`, because Next's route announcer carries that
role too and a role-based count is never zero, and a fixture stopped writing `over_balance_days: 0`
because the column's check is `> 0`. One test, the same test, asserting something it had not been
asserting before. The tip's e2e log prints `Running 51 tests using 2 workers`
(job 134493013136, header at `00:56:35Z`, summary `51 passed (48.2s)` at `00:57:09Z`), which is the pair
summed the other way now — `51 + 0` — and five heads have printed that header verbatim: `6e78d48` at
`23:19:50Z` (job 134444052037), `7e24bbb` at `23:37:52Z` (job 134452766151) and `6be1239` at `00:07:39Z`
(job 134467615728), each of those three with a `3 skipped` under it, then `ace715e` at `00:42:38Z` (job
134484448278) and `2e2fb77` at `00:56:35Z` with no skipped line at all; the arithmetic one head further back
was `Running 50` for `47 + 3` (job 134440019579, `23:11:28Z`). `Running N` is a property of a tree rather
than of a branch, which is why head after head can print it identically while pgTAP's pair moves underneath
them — `Running 51` was true of `6be1239` and of `7e24bbb` at the same moment their `Files=` were 62 and 64
— and these five sharpen it further than the pgTAP comparison did: one header, two different pairs beneath
it, because `Running` counts what is *collected* and says nothing about what is *permitted to run*. The last
two are the same header over the same pair, and the only difference between them is that one number needed a
second job to be printed: 42.2s against 48.2s, and neither wallclock is a count. The 47 is corroborated from the other end by lane 3's note on
[#361](https://github.com/igsl-au-samuel/away-lms/issues/361) at `22:39:42Z`, which read `Running 50
tests — 47 passed, 3 skipped` on #418's branch before it merged and warned that the number belongs to
the merge-day head rather than to the PR: the reading above is the one it asked for. `c3d1655`
(#394) added six by turning `tests/e2e/a11y.spec.ts` into
one row per role and per colour scheme plus two error-state audits, without adding a file;
`232bba9` (#403) added six more in a brand-new `tests/e2e/access.spec.ts`, which is what moved the
denominator from 12 to 13; `1aba947` (#399) made it 14 with two reset-link tests; and `a874808`
(#406) is the 15th file while adding nothing to 43, because its three tests are parked until A059
creates the page they load — which it did, sixteen merges and one evening later, at `ace715e`, and the
last paragraph of this section carries what that did and did not change. So neither half of the pair
predicts the other, and an e2e count says nothing about route coverage on its own — the files, or
`npx playwright test --list`, are the thing to read. That list was measured on an earlier head, and it
is inherited rather than re-run here: `git log --oneline 232bba9..origin/main --
tests/e2e/access.spec.ts` prints nothing at `6e78d48` or at the tip, and
`git rev-parse 232bba9:tests/e2e/access.spec.ts origin/main:tests/e2e/access.spec.ts` answers the same
blob `27e42f8` twice, which is the stronger form of the claim — the file the `--list` was read off is
byte-identical to the one on the tip, matrix still at `access.spec.ts:17`. It ends `Total: 6 tests in 1
file`: one navigation test and one reach/refusal test per role.

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

The thirty-six are not parked any more, and the move has the same shape as A055's in pgTAP. On
`6fe8763` those two lines read `Tests 365 passed (365)` (job 134440019753) and `Test Files 25 passed
(25)`, and the merge that moved them is `817e3bb` (A056, **#411**): it created `src/server/audit.ts` —
273 lines, the module A053 wrote its fixtures against — and in the same commit took the `existsSync`
flag, the `describe.skipIf` and the matching `@ts-expect-error` out of `tests/unit/audit.test.ts`,
which is the pairing decision 7 expects because TS2578 reddens `typecheck` on an unused expect-error.
That one file gained 30 lines and lost 11, including one new `it(` — "names the requester when no
signed-in person wrote the submission, and the actor when one did" — so 36 sleeping assertions became 37
running ones and the total is 328 + 37 = 365. `Test Files` did not move: the 25th file was already being
counted, as skipped. It is also the easiest of these shapes to miss: a guard waking moves the split
inside the denominator, not the denominator, so a walker who reads only `25 passed (25)` would conclude a
suite that had not been touched at all.

`test:e2e` runs `/history` now and still runs no `/admin/audit`, and the two halves of that sentence have
different histories. On `1aba947` there was no spec for either; since `a874808` there has been a
`tests/e2e/audit.spec.ts` with exactly the three my-history tests this section wants, and until `ace715e`
Playwright skipped all three, because `test.skip(HISTORY === "", …)` at `tests/e2e/audit.spec.ts:35`
walked `src/app` for a `history/page.tsx` that A059 had not written yet. That page is in the tree now, so
those three are inside the 51 passing at the tip — and the guard's own text is still in the file
(`git show origin/main:tests/e2e/audit.spec.ts | grep -c "test.skip("` answers 1), which is what decision
7 buys: the route is derived by `historyRoute()` at `:21` rather than typed, because A060's fallback says
`/me/history` and a literal string would have stayed skipped after the page arrived one directory over.
`grep "/history"` in that file answers nothing at all, which is the same fact from the other side and the
reason a text search for a route is not a coverage check.

The other half is still unbuilt. Nothing in `tests/e2e` visits `/admin/audit` — `git grep -c "/admin/audit"
origin/main -- tests` answers no file — not even `admin.spec.ts`, which stops at `/admin/users`,
`/admin/demo` and `/admin/leave-types`, because that page is A067, which extends this same file in slice
4. That stop-list is re-measured here rather than inherited, because two merges since it was first read
edit files in this directory: `git show origin/main:tests/e2e/admin.spec.ts | grep -oE '"/[a-z/-]*"' |
sort -u` answers the same four literals as `7e24bbb` did — `/admin/demo`, `/admin/leave-types`,
`/admin/users` and `/profile` — so the merge that moved pgTAP and the merge that woke these three tests
both moved no admin coverage. What did move is invisible in the same way: `a11y.spec.ts` now walks
`/history` for all three seeded roles, inside the six tests it already had.

The reading to keep from this section is the one the paragraph above made of `36 skipped` in unit at the
other end of the same decision 7, and it now has its ending measured in both suites: those thirty-six woke
at `817e3bb` when the module landed, without a new file and without changing a denominator, and these
three woke at `ace715e` the same way — which means the `3 skipped` a walker saw in the e2e output at any
head from `a874808` to `6be1239` was slice 3 being unbuilt, not a broken test, and there is no skipped
line to see at all today. So the two comments above, and the manual list below, describe the finished
feature; the `/history` half of them is now also what passes, and the `/admin/audit` half is not.

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

*Checked 2026-11-17, not run*: the step is still not walkable, but "none of it exists" stopped being
true at `8450da9`. `public.audit_my_history(p_before_at, p_before_id, p_limit)` — `stable`,
`security invoker`, `search_path = ''`, limit capped at 100, default 50 — is on `main`, and row 42
runs its sixteen assertions against it, so one of the three reads this step times has a subject. The
other two do not: `scripts/seed-audit-volume.ts` is A068, and `audit_search` / `audit_export_csv`
are A069. There is also nothing to seed *with*, which reaches the function that does exist: with no
volume script, a timing of `audit_my_history` on a demo-sized table measures the shape of a query
plan and not the 50,000-row case SC-008 is written against, so this step stays unrunnable as a whole
until A068 lands even though A055 made one clause of it premature.
What `private` holds today is eight `audit`-prefixed functions:
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

## 7. Bringing a lagging stack up to date — `--local`, never bare

Steps 1, 2, 4 and 6 answer wrong on a stack whose ledger is behind, and the reset the prerequisites
bullet refuses is not the only hazard standing near that sentence. The narrow repair is
`supabase db push`, and the flag on it is not decoration. This CLI's own help, run in the repo:

```
npx supabase db push --help
  DESCRIPTION
    Push new migrations to the remote database. Vault secrets from config.toml are updated
    before migrations unless --skip-vault is set.
  FLAGS
    --linked                Pushes to the linked project.
    --local                 Pushes to the local database.
    --project-ref string    Project ref of the Supabase project.
    --db-url string         Pushes to the database specified by the connection string.
    --dry-run               Print the migrations that would be applied, but don't actually apply them.
```

"Remote" means the linked project, and which project that is lives in per-checkout state git never
sees: `supabase/.gitignore:3` ignores `.temp`, so the link is `supabase/.temp/project-ref` in
whichever tree you are standing in. On this machine the main clone has that file and
`linked-project.json`; the worktree these notes were measured in has neither. The same two words are
therefore a production migration in one directory and an error in the other — which is a worse footgun
than the lag it is meant to fix, because `db:reset` cannot reach production by forgetting a flag and
this can. `--skip-vault` is not the default either, so the bare form offers to write vault secrets from
`config.toml` before it applies a version.

Production has a route that is not a walker's to duplicate by hand:
`.github/workflows/deploy-db.yml` links with an explicit `--project-ref` from secrets and runs
`npx supabase db push --yes` on every push to `main`, inside a `deploy-db` concurrency group that
never cancels mid-migration (`:16-18`, `:35-36`). Locally, both commands take `--local`, and the first
one writes nothing:

```bash
npx supabase db push --local --dry-run   # lists the versions it would apply; read this output
npx supabase db push --local             # applies exactly those; no drop, no re-seed
```

Stop if the dry run lists anything beyond the versions the measurement below says are missing. Three
forms are unsafe and all three are named in [#361](https://github.com/igsl-au-samuel/away-lms/issues/361)
at `2026-11-17T22:18:11Z`, written after the first of them had already been posted on this page and in
that issue: the bare command, which takes the default remote; `--linked`, which says the same thing out
loud; and a hand-typed `--project-ref`, which points a migration at whichever project the fingers
remembered.

### The measurement that identifies a lag

Read-only against the running container, so it needs no `holding DB` claim and writes nothing:

```bash
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select count(*) from supabase_migrations.schema_migrations"                        # → 33
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select version from supabase_migrations.schema_migrations order by version desc limit 1"
                                                                                      # → 20261117140000
ls supabase/migrations | wc -l                                                        # → 33
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select coalesce(to_regprocedure('public.audit_my_history(timestamptz,bigint,integer)')::text,'ABSENT')"
                                                                                      # → the function
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select exists (select 1 from pg_proc where pronamespace='private'::regnamespace
     and proname='log_leave_type_default')"                                            # → f
```

The applied count and the file count are the pair to compare; the last two queries are the same gap
seen from the schema, and they are what makes the answer independent of either number. Twenty-three
minutes earlier the same five commands printed `31`, `20261117022917`, `33`, `ABSENT` and `t` — two
migrations short, exactly `20261117031500_audit_allowance_swap.sql` (A039) and
`20261117140000_audit_my_history.sql` (A055), which is why `tests/e2e/admin.spec.ts:66` was red locally
and green in CI and why a local `db:test` on that stack was a pre-swap result. Those readings were
step 6's rule in practice — a lag on a stack several sessions share is the normal state rather than a
fault to file — and the two commands above are the repair.

Orchestration claimed the stack at `22:18:11Z`, ran the dry-run and then `db push --local`, and
released it at `22:21:28Z`. The block above is this lane's own re-read afterwards, at `22:28:53Z`, and
one check beyond it:

```bash
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select prosrc like '%away.audit_reason%' from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_set_allowance'"                  # → t
docker exec supabase_db_Leave_Management_System_-_SDLC psql -U postgres -d postgres -tAc \
  "select count(*) from public.audit_log"                                              # → 348
```

The first says the swap body is the live one. The second is the reason this is called additive rather
than merely short: `348` is the figure session 3 captured read-only at `21:41:46Z`, before anything ran,
and it is unchanged — two migrations went in and every row count stayed where it was. No reset, no
seed, no `loadDemo`, so #214 never came into play.

One consequence of the same push, worth knowing before the next `types:gen`: the command is
`supabase gen types typescript --local > src/lib/database.types.ts` (`package.json:25`), so it reads
the live catalog rather than the tree and overwrites a checked-in file. That file last changed in
`ad5daa7` (slice 1, #354) and holds no `audit_my_history` — which describes when it was generated, and
says nothing about the stack, so do not read the absence as a measurement. Now that the catalog has the
function, a regeneration picks it up: push first, generate second, read the diff third.

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

# Tasks: Transaction audit log

**Input**: Design documents from `/specs/002-transaction-audit/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED for every behaviour change and every RLS policy (Constitution III and V). Within a phase, write the tests first and confirm they fail before implementing. Every row 28–42 of [access-matrix.md](contracts/access-matrix.md) has its own pgTAP task with an allowed and a refused case.

**Organization**: Phases follow the **four delivery slices in plan.md**, not story priority order. Each slice is one PR that leaves `main` green. Slice 1 = Phases 2–3 (US1), slice 2 = Phase 4 (US4), slice 3 = Phase 5 (US2), slice 4 = Phase 6 (US3). Migration B is a separate later PR (Phase 4b).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story from spec.md (US1–US4). Setup, Foundational and Polish tasks have none.
- **🧑 manual**: Sam does it (production check). An agent prepares the query but must not run it against production.

## Conventions

- Create each migration with `npx supabase migration new <name>`; the file lands in `supabase/migrations/<ts>_<name>.sql`. Keep the order A1 → A2 → A3 → A4 → reads → B.
- New pgTAP files go in `supabase/tests/`, start with the comment convention used by `row22_admin_set_allowance.sql`, run in a rolled-back transaction, and use the `tests.*` helpers from `00_helpers.sql`. Never `delete from audit_log` in a test (immutable); use rollback.
- Every `private` function: `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated, service_role` by name (ADR 0009). Exception: `private.can_view_audit` keeps `execute` for `authenticated`.
- `audit_log` before/after values come from an explicit field list per table, never `to_jsonb(row)` (FR-007).
- Audit reads always use the user's session, never the secret key.

## Decisions made while writing these tasks

1. **Slices 1 and 2 stay separate PRs.** Slice 1 is two migrations plus about 20 pgTAP files; slice 2 is a backfill, an RPC swap, three page edits and edits to four existing tests. Together that is too large for one review. Sam can merge them if preferred; if so, the cutoff rule in A038 becomes unnecessary.
2. **Backfill moves to slice 2.** plan.md's slice 1 line says "A1–A3" but its slice 2 line says "A4 backfill". The backfill (A3) is US4 and is built in slice 2 (Phase 4). Slice 1 = A1 + A2 only.
3. **Backfill cutoff.** Between slice 1 and slice 2 shipping, live triggers write entries (and allowances are double-written, plan.md slice 1). A plain backfill would duplicate them. A038 therefore only backfills source rows older than the first live entry (`min(created_at)` over `is_backfilled = false`), and A034 tests it. This refines R7.
4. **My history sits in the main nav**, as "History" (Lucide `History` icon) between Calendar and Profile, for all roles. DIRECTION.md defines only the sidebar and mobile bottom bar, not a placement. Admins would then have 7 bottom-bar items, so A060 checks it at 360 px and, if it does not fit, falls back to a link on the Profile page. The Audit page is a tab in `AdminTabs`, not a main nav item.
5. **Read functions split by slice.** plan.md has one `audit_reads` migration (A5). To let slice 3 ship alone it becomes two files: `audit_my_history` (slice 3) and `audit_search` + `audit_export_csv` (slice 4).
6. **Shared filter.** `audit_search` and `audit_export_csv` share one `security invoker` helper, `private.audit_matches(...)`, so screen and file cannot drift (database-api.md). Authenticated already has `usage` on `private` for the existing policies.

---

## Phase 1: Setup

**Purpose**: baseline and shared test helpers.

- [x] A001 Baseline: run `npm run db:reset`, `npm run db:test`, `npm run db:lint`, `npm test`, `npm run test:integration` on the branch and note the pass counts at the top of the PR description. SC-009 means these must pass unchanged at the end of every slice (except the tests deliberately edited in A035, A036 and Phase 4b).
- [x] A002 [P] Add audit helpers to `supabase/tests/00_helpers.sql`: `tests.as_service()` (set role `service_role`, no JWT claims) and `tests.audit_entries(p_action text default null)` returning the `audit_log` rows as the superuser role, ordered `id`. The second reads as owner so tests can check entries a caller cannot see.

---

## Phase 2: Foundational (slice 1, part 1) — table, append-only, actor

**Purpose**: the table that nothing else can exist without. Slice 1 is not mergeable until Phase 3 is also done, because without the triggers the log stays empty.

**⚠️ CRITICAL**: Phase 3 cannot start until T009–A011 are green.

### Tests first ⚠️

- [x] A003 [P] Row 36 in `supabase/tests/row36_audit_log_no_insert.sql`: insert into `audit_log` as employee, manager, admin, inactive user, anon (each `42501`) and as `service_role` (`42501`, no grant). Row count unchanged.
- [x] A004 [P] Row 37 in `supabase/tests/row37_audit_log_no_update.sql`: update refused as E, M, A, X, anon and `service_role` (each `42501`); as an owner or superuser session the error is `audit_immutable`. The entry is unchanged afterwards. Seed one row through `private.audit_write` as owner.
- [x] A005 [P] Row 38 in `supabase/tests/row38_audit_log_no_delete.sql`: same shape as A004 for `delete`.
- [x] A006 [P] Row 39 in `supabase/tests/row39_audit_log_no_truncate.sql`: `truncate` refused for E, M, A, X, anon and `service_role` (`42501`); `audit_immutable` for an owner or superuser session.

*The `service_role` expectation in A004–A006 was corrected after measurement in #354: Postgres checks grants before it fires a trigger, so the secret key is refused with `42501` like every other API role. A003 already had it right.*
- [x] A007 [P] Row 40 in `supabase/tests/row40_audit_private_functions.sql`: calling `private.audit_write`, `private.audit_backfill` (once it exists, assert via `to_regprocedure` guard so the file passes in slice 1), `private.audit_actor` and each trigger function directly is refused for E, M, A, X, anon and `service_role`.
- [x] A008 [P] `supabase/tests/audit_actor.sql` (research R1): signed-in user returns their id, role and name; no `sub` returns id null, role null, name `System`; a uid with no profile returns name `Unknown user`; actor role is the role held now, read inside a `security definer` function (proves `auth.uid()` survives it).

### Implementation

- [x] A009 Migration A1 `supabase/migrations/<ts>_audit_log.sql`: create `public.audit_log` exactly per data-model.md (columns, `check (char_length(comment) <= 500)`, `check` lists for `action` and `entity`, identity PK, no foreign keys, unique `source_key`); the five indexes; `alter table … enable row level security`; `revoke all` from `anon, authenticated, service_role` then `grant select` to `authenticated`; `private.audit_immutable()` raising `P0001` / `audit_immutable`; triggers `audit_no_update_delete` (before update or delete, per row) and `audit_no_truncate` (before truncate, per statement); `private.can_view_audit(actor uuid, subject uuid, entity text, action text)` per research R6 (`stable`, null role returns false); the single `select` policy `audit_log_select` using it. Read research R5 and R6 first.
- [x] A010 Migration A2 part 1 `supabase/migrations/<ts>_audit_triggers.sql` (this file is completed by T027–A030): `private.audit_actor()` per R1 and `private.audit_write(...)`, the only insert into `audit_log`. It takes action, entity, entity id, subject id, before, after, context, comment, optional `created_at` and `source_key`, then fills actor, role, name snapshots, subject name from `profiles`, and `is_demo` from the subject's demo flag (falls back to the actor's). Execute revoked per Conventions.
- [x] A011 Run `npm run db:reset && npm run db:test && npm run db:lint`. T003–A008 pass; `rls_enabled.sql` still passes (it covers the new table); nothing else changed.

**Checkpoint**: `audit_log` exists, is append-only for every role and route, and can be written by the database only.

---

## Phase 3: User Story 1 — Every change leaves an unalterable record (P1) 🎯 MVP — slice 1

**Goal**: submit, decide, allowance, user and leave-type changes each write exactly one entry, by every route, with correct actor and visibility.

**Independent Test**: make each kind of change by RPC, direct SQL and secret key; exactly one matching entry per change (or one per changed field); no role can edit or delete; each role sees only what FR-020 allows.

### Tests for User Story 1 ⚠️

> Write first and confirm they fail (the triggers do not exist yet). Rows 28–35 each seed their entry through a real event, so each also proves its trigger wrote it.

- [x] A012 [P] [US1] Row 28 in `supabase/tests/row28_audit_select_own.sql`: employee, manager and admin each see an entry where they are actor or subject; inactive user and anon see none.
- [x] A013 [P] [US1] Row 29 in `supabase/tests/row29_audit_select_other.sql`: employee and manager cannot see another person's non-default entry (and `count(*)` shows 0, FR-022); admin sees it.
- [x] A014 [P] [US1] Row 30 in `supabase/tests/row30_audit_select_decidable_requests.sql`: manager sees `request_*` entries for an employee and for the admin requester; employee cannot; admin can.
- [x] A015 [P] [US1] Row 31 in `supabase/tests/row31_audit_select_decidable_allowances.sql`: manager sees `allowance_*` entries for an employee and the admin; employee cannot.
- [x] A016 [P] [US1] Row 32 in `supabase/tests/row32_audit_select_other_manager.sql`: manager cannot see request or allowance entries of another manager, nor entries where the manager's own request is neither actor nor subject for them; admin can.
- [x] A017 [P] [US1] Row 33 in `supabase/tests/row33_audit_select_default_change.sql`: `leave_type_default_changed` visible to E, M, A; not to inactive or anon.
- [x] A018 [P] [US1] Row 34 in `supabase/tests/row34_audit_select_leave_type_changed.sql`: `leave_type_changed` visible to admin only.
- [x] A019 [P] [US1] Row 35 in `supabase/tests/row35_audit_select_user_entries.sql`: `user_*` entry about another person visible to admin only; the subject sees their own.
- [x] A020 [P] [US1] `supabase/tests/audit_events_requests.sql` (FR-031, SC-001): `submit_leave_request` writes one `request_submitted` (actor and subject the requester, `after.status = pending`, `context` has dates, type, working days); `decide_leave_request` approve with a comment writes one `request_approved` (actor role manager, before `pending`, after `approved`, comment kept) and decline writes `request_declined`; the same via direct `insert` and `update` as owner (actor System); rejected calls (`already_decided`, `not_allowed`, overlapping dates) write nothing (US1-8, FR-004); an update that does not change `status` writes nothing.
- [x] A021 [P] [US1] `supabase/tests/audit_events_allowances.sql`: `admin_set_allowance` insert path writes one `allowance_set` with `before.days` from the type default when no prior override; the update path takes the prior override; direct delete writes one `allowance_removed` with `after.days` null and `context.default_days`; secret-key (service role) insert records System; a no-op update of `days` to the same value writes nothing. Note the old `allowance_changes` row is still written in this slice (plan slice 1); assert both, so A039 can later remove one half.
- [x] A022 [P] [US1] `supabase/tests/audit_events_users.sql`: `admin_create_profile` writes one `user_created`; `admin_update_user` changing role and region together writes exactly two entries (`user_role_changed`, `user_region_changed`); `admin_set_active` writes `user_active_changed`; own region update writes `user_region_changed` with the user as actor; saving the same values writes nothing; updating only `email` or `full_name` writes nothing and no entry anywhere contains an `email` key (FR-007); direct SQL and secret key record System.
- [x] A023 [P] [US1] `supabase/tests/audit_events_leave_types.sql`: changing `default_allowance` writes one `leave_type_default_changed`; changing `name` writes one `leave_type_changed`; both in one save write one of each; changing neither writes nothing; `context.leave_type_name` is the name at the time (survives a later rename); the old `leave_types_log_default` trigger still fires (both logs written until A039).
- [x] A024 [P] [US1] `supabase/tests/audit_retention.sql` (FR-012, FR-013, SC-007): deleting a user, a request and a leave type leaves every entry that refers to them unchanged and with the original name snapshot; deleting a demo user that cascades their `allowance_overrides` writes no `allowance_removed`; deleting a user's own override while the profile exists does write one; entries are ordered `(created_at desc, id desc)` with a stable tie-break when `created_at` is equal.
- [x] A025 [P] [US1] `supabase/tests/audit_demo.sql` (D6, D8, FR-010): entries about a demo subject have `is_demo = true`; a demo `user_created` made with the secret key has actor System and is demo-marked; a demo employee sees only own entries and default changes, never a real colleague's; `is_demo` stays true after the demo user is deleted.

### Implementation for User Story 1

- [x] A026 [US1] Extend `supabase/migrations/<ts>_audit_triggers.sql` with `private.audit_requests()` and triggers `audit_insert` (after insert) and `audit_decision` (after update of `status`, `when old.status = 'pending' and new.status <> old.status`) on `public.leave_requests`, per R3 and data-model.md. `comment` from `decision_comment`, `context` with dates, leave type name and working days.
- [x] A027 [US1] Same file: `private.audit_allowances()` and trigger `audit_change` on `public.allowance_overrides` (after insert, update of `days`, delete). Reason from `nullif(current_setting('away.audit_reason', true), '')` (R2); `old` from the prior override or the type default; delete skips when `not exists (select 1 from public.profiles where id = old.user_id)`. Leave `admin_set_allowance` and `leave_types_log_default` untouched in this slice.
- [x] A028 [US1] Same file: `private.audit_profiles()` and triggers `audit_insert` and `audit_change` on `public.profiles` (after update of `role, region_code, is_active`, `when` any is distinct; one entry per changed field). Field list excludes `email` and every auth column.
- [x] A029 [US1] Same file: `private.audit_leave_types()` and trigger `audit_change` on `public.leave_types`, splitting `default_allowance`/`is_capped` (`leave_type_default_changed`, subject null) from `name`/`is_active`/`sort_order` (`leave_type_changed`).
- [x] A030 [US1] Revoke execute on every new `private` function per Conventions, then run `npm run db:reset && npm run db:test && npm run db:lint`. Rows 28–40 and T020–A025 pass. Existing 001 tests pass unchanged, including `row22_admin_set_allowance.sql` and `leave_type_default_log.sql` (SC-009).
- [x] A031 [P] [US1] Regenerate `src/lib/database.types.ts` (`npx supabase gen types typescript --local`) and run `npm run typecheck`.
- [x] A032 [US1] Extend `tests/integration/demo-reset.test.ts` for D7: snapshot all `audit_log` rows read through the admin user session (the secret key has no select grant), run demo load, reset and remove, and assert every real (non-demo) row is byte-identical afterwards and no demo entry was deleted. Loading demo data must create entries marked `is_demo`.
- [x] A033 [US1] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`. Open PR "feat: audit log, record every change (slice 1)" referencing the slice 1 issue.

**Checkpoint**: the log fills itself from every route and nobody can alter it. No screen yet. `allowance_changes` and its readers are untouched. MVP of the feature.

**What the ticks above mean**: A002 came in **#353** and A001, A003–A033 in **#354**; both merged on 2026-11-16, as `1b0e3c7` and `ad5daa7`, so slice 1 is on `main`. It reached the hosted database at `2026-11-17T01:15:44Z`, when the first **Deploy DB** run to pass after the outage recorded on #366 applied `20261116062027_audit_log.sql` and `20261116062030_audit_triggers.sql` (run 43994137554) — production has the table, its grants and its triggers. Every run between the slice 1 merge and that one failed, which is why the hosted database lagged `main` by about an hour and a half. `allowance_changes` is still written and still read, so an allowance change is recorded twice until slice 2. Counts on the slice 1 branch: `db:test` 663 against a 452 baseline, integration 68 against 67, unit 290, e2e 23, `db:lint` clean; the same walk on `main` at `7857562` found 62 files / 663 assertions and 24 e2e tests — see the measured lines in [quickstart.md](quickstart.md). Where a task's stated expectation was contradicted by measurement the correction is recorded here, not only in the PR: see the note above A007 on `service_role` and rows 36–39 of [contracts/access-matrix.md](contracts/access-matrix.md).

---

## Phase 4: User Story 4 — Existing history is carried over (P4) — slice 2

**Goal**: past requests and allowance changes appear as audit entries; the old allowance log stops being written and all three readers use the audit log.

**Independent Test**: load a database with known requests and allowance changes, run the migration, check a matching entry for each with original time, people and comment; rerun adds nothing; the three allowance panels show the same history as before.

### Tests for User Story 4 ⚠️

- [ ] A034 [P] [US4] `supabase/tests/audit_backfill.sql` (SC-006, R7): with pending, approved and declined requests and allowance changes (including a default change with `user_id` null) seeded as owner with `set session_replication_role = replica` so no live entries exist, `private.audit_backfill()` creates one `request_submitted` per request and one decision entry per decided request using `created_at`, `decided_at`, `decided_by` and `decision_comment`; one entry per `allowance_changes` row with `before.days`, `after.days`, `changed_by`, `changed_at`, `reason` as comment, and `context.leave_type_name`/`year`; a null `user_id` becomes `leave_type_default_changed`; `source_key` values are `req:<id>:submitted`, `req:<id>:decided`, `ac:<id>`; all `is_backfilled`; running it twice leaves the same count; **cutoff**: a request, decision and allowance change newer than the earliest live entry are not backfilled, so no duplicates of live entries; a backfill with no live entries backfills everything.
- [ ] A035 [P] [US4] Update `supabase/tests/row22_admin_set_allowance.sql` so its log assertions read `audit_log` (`allowance_set`, `before.days`, `after.days`, actor, `comment` = the reason) instead of `allowance_changes`; assert `allowance_changes` gets no new rows from `admin_set_allowance`. Also add a case: an empty reason after a non-empty one in the same transaction does not inherit it (R2).
- [ ] A036 [P] [US4] Update `supabase/tests/leave_type_default_log.sql` to assert `leave_type_default_changed` entries in `audit_log` (old, new, actor, time), a rename writes `leave_type_changed` not a default entry, and a change with no caller now records System (R8: this improves on the old trigger). Assert `allowance_changes` receives no new rows.
- [ ] A037 [P] [US4] `tests/unit/allowance-log.test.ts`: the mapper that turns `audit_log` rows into `AllowanceLogEntry` (`src/components/allowance-log.tsx`) handles `allowance_set`, `allowance_removed` (new = null shown as Default), `leave_type_default_changed` (`before.default_allowance`/`after.default_allowance`), a null comment, and a null actor name.

### Implementation for User Story 4

- [ ] A038 [US4] Migration A3 `supabase/migrations/<ts>_audit_backfill.sql`: `private.audit_backfill()` per R7 (`insert … on conflict (source_key) do nothing`, direct `audit_log` inserts with original `created_at`, current names and roles, `is_backfilled = true`) restricted to source rows older than `(select min(created_at) from public.audit_log where not is_backfilled)` when such an entry exists; execute revoked per Conventions; one `select private.audit_backfill();` at the end. Do not touch business tables.
- [ ] A039 [US4] Migration A4 `supabase/migrations/<ts>_audit_allowance_swap.sql`: replace `public.admin_set_allowance` (same signature, same errors) so it calls `set_config('away.audit_reason', coalesce(p_reason, ''), true)` before the write and no longer inserts into `allowance_changes`; `drop trigger leave_types_log_default on public.leave_types` and `drop function private.log_leave_type_default()`. Leave the `allowance_changes` table, policies and grants in place (frozen).
- [ ] A040 [US4] `src/server/allowance-log.ts` (new): one function that reads `audit_log` for `action in ('allowance_set','allowance_removed','leave_type_default_changed')`, optionally for a set of `subject_id`s, and maps rows to `AllowanceLogEntry` (A037). It returns the same shape as before so `src/components/allowance-log.tsx` needs no change beyond what the test requires.
- [ ] A041 [P] [US4] Switch the dashboard reader in `src/app/(app)/page.tsx` (the `allowance_changes` query around line 20) to `src/server/allowance-log.ts`, own subject plus default changes.
- [ ] A042 [P] [US4] Switch the Approvals reader in `src/app/(app)/approvals/page.tsx` (around line 41) to `src/server/allowance-log.ts` for the queue requesters' `subject_id`s (policy rows 31 allow this).
- [ ] A043 [P] [US4] Switch the admin user page reader in `src/app/(app)/admin/users/[id]/page.tsx` (around line 32) to `src/server/allowance-log.ts` for that user plus default changes.
- [ ] A044 [US4] Run `npm run db:reset && npm run db:test && npm run db:lint && npm test && npm run test:integration && npm run test:e2e && npm run build`. `approvals.spec.ts` (allowance log in the queue) and `admin.spec.ts` pass unchanged. Open PR "feat: carry over history and read allowance log from audit (slice 2)".

**Checkpoint**: allowance history has one home. Old log is frozen but still present.

### Phase 4b: Retire `allowance_changes` (migration B) — separate later PR

**Gate**: 🧑 A045 must be confirmed before A046 starts.

- [ ] A045 🧑 Sam runs against production: `select (select count(*) from allowance_changes) as old_rows, (select count(*) from audit_log where source_key like 'ac:%') as backfilled;` The two numbers must be equal (quickstart step 4). An agent writes the query into the PR description and does not run it.
- [ ] A046 Migration B `supabase/migrations/<ts>_drop_allowance_changes.sql`: drop `public.allowance_changes` with its policies, grants and indexes.
- [ ] A047 [P] Delete `supabase/tests/row23_allowance_changes_select.sql` and `supabase/tests/row24_allowance_changes_no_direct_write.sql` (superseded by rows 28–35 and 36–38). Remove any remaining `allowance_changes` references in `supabase/tests/`.
- [ ] A048 [P] In `tests/integration/demo-reset.test.ts` remove the `allowance_changes` snapshot (around line 29) and move 001's D4 expectation onto `audit_log` (already covered by A032); in `tests/e2e/admin.spec.ts` remove the `allowance_changes` cleanup (line 92).
- [ ] A049 [P] Update `specs/001-mvp/contracts/access-matrix.md`: mark rows 23–24 and D4 superseded by `specs/002-transaction-audit/contracts/access-matrix.md`.
- [ ] A050 Regenerate `src/lib/database.types.ts`; run the full suite from A044 plus `npm run typecheck`. Open PR "chore: drop allowance_changes".

---

## Phase 5: User Story 2 — Everyone can see their own history (P2) — slice 3

**Goal**: every signed-in user has a "History" page with the entries they may see, newest first, paged.

**Independent Test**: sign in as employee, manager, admin and a demo employee; each sees exactly their allowed entries; empty state for a new user; older entries load without changing order.

Depends on slice 1 only.

### Tests for User Story 2 ⚠️

- [ ] A051 [P] [US2] Row 42 in `supabase/tests/row42_audit_my_history.sql`: employee gets own entries and default changes; manager also gets decidable `request_*` and `allowance_*` entries and none for other managers; admin gets own entries plus default changes only (not everyone's); inactive user gets no rows; anon is refused `42501`.
- [ ] A052 [P] [US2] `supabase/tests/audit_my_history_behaviour.sql`: keyset paging with `(p_before_at, p_before_id)` returns the next page with no gap or repeat across equal `created_at`; `p_limit` above 100 returns 100; default is 50; deleted users' entries still appear with the name snapshot (US2-3).
- [ ] A053 [P] [US2] `tests/unit/audit.test.ts`: formatting helpers in `src/server/audit.ts`: a plain-language sentence for each of the 11 actions (for example "Sam approved Alex's request for 3 Mar–5 Mar"), a before/after summary (`field: old → new`), "System" and "Demo" labels, "default now applies" for `allowance_removed`, comment rendered as plain text, time formatted in a given IANA zone. Include a comment containing `<script>` to confirm it is returned as a string, not markup.
- [ ] A054 [P] [US2] `tests/e2e/audit.spec.ts` (My history part): employee sees only own entries and a colleague's request is absent; manager sees the entry for an employee's request they can decide; a user with no entries sees the empty state; a failed load shows the error state with a retry link.

### Implementation for User Story 2

- [ ] A055 [US2] Migration `supabase/migrations/<ts>_audit_my_history.sql`: `public.audit_my_history(p_before_at timestamptz default null, p_before_id bigint default null, p_limit int default 50)` per database-api.md. `security invoker`, `stable`, `search_path = ''`, limit capped at 100, `revoke all … from public, anon` by name then `grant execute … to authenticated`. Own entries (`actor_id` or `subject_id` = `auth.uid()`) plus `leave_type_default_changed` plus, for managers only, `leave_request` and `allowance` entries for subjects whose current role is `employee` or `admin` and who are not the caller.
- [ ] A056 [US2] `src/server/audit.ts` (new): `AuditEntry` type from `audit_log`, `describeEntry()` (sentence), `describeChange()` (before/after text), `fetchMyHistory(cursor)` calling `audit_my_history` through `src/lib/supabase` server client with the user's session. One database call per page.
- [ ] A057 [P] [US2] `src/components/audit/entry-list.tsx`: accessible list (time, who, what, to whom, change, comment); "Demo" and "System" shown as text, never colour alone (FR-028); stacked rows at phone width; "Load older" link using the cursor in the URL. Plain `{text}` rendering only, no `dangerouslySetInnerHTML`. Tokens from `docs/design/DIRECTION.md` only.
- [ ] A058 [P] [US2] `src/components/audit/audit-states.tsx`: empty state ("No history yet") and error state with a retry link, used by both audit pages.
- [ ] A059 [US2] `src/app/(app)/history/page.tsx`: server component, reads the cursor from `searchParams`, calls `fetchMyHistory`, renders the list, empty and error states, and the viewer's timezone via the existing helper in `src/lib/dates.ts`.
- [ ] A060 [US2] Add the "History" link (Lucide `History` icon, roles all three) to `LINKS` in `src/components/nav.tsx`, between Calendar and Profile (decision 4). Check `tests/e2e/mobile.spec.ts` at 360 px for an admin: the 7-item bottom bar must not scroll horizontally or clip labels. If it does, remove the nav entry and instead link to `/history` from the Profile page (`src/app/(app)/profile/`) and the dashboard, and record the change in the PR.
- [ ] A061 [P] [US2] Add `/history` to the axe checks in `tests/e2e/a11y.spec.ts`.
- [ ] A062 [P] [US2] Regenerate `src/lib/database.types.ts`; run the full suite (A044 command list). Open PR "feat: My history page (slice 3)".

**Checkpoint**: everyone can see their own trail. Admin-wide view still missing.

---

## Phase 6: User Story 3 — Admin investigates with the Audit page (P3) — slice 4

**Goal**: admin lists, filters and exports all entries; others are refused.

**Independent Test**: with entries from several people and kinds, each filter alone and combined returns only matches; the CSV holds the same rows and values as the screen; employee and manager get 403.

Depends on slice 3 (reuses `src/server/audit.ts` and the list components).

### Tests for User Story 3 ⚠️

- [ ] A063 [P] [US3] Row 41 in `supabase/tests/row41_audit_search_export.sql`: `audit_search` and `audit_export_csv` raise `not_allowed` for employee, manager and inactive admin; anon `42501`; active admin succeeds.
- [ ] A064 [P] [US3] `supabase/tests/audit_search.sql`: each filter alone (`p_person` matches actor or subject, `p_action`, `p_entity`, `p_role` on `actor_role`, `p_demo` true/false/null, `p_from` inclusive, `p_to` exclusive), combined filters narrow further, keyset paging, limit cap 100, entries about a deleted user still returned with their name (US3-5).
- [ ] A065 [P] [US3] `supabase/tests/audit_csv.sql` (FR-025, FR-026): header and 12 columns in the documented order; every cell quoted with doubled quotes; comments starting `=1+1`, `+x`, `-x`, `@x`, a tab or a CR come out prefixed with `'`; times in `p_tz` (test two zones); `before`/`after` as `field: value; field: value`; the file has exactly the rows `audit_search` returns for the same filters; more rows than `p_limit` sets `truncated` and keeps the newest; `p_limit` above 10,000 is capped; a bad `p_tz` raises `invalid_timezone`.
- [ ] A066 [P] [US3] Add to `tests/unit/audit.test.ts`: filter parsing for the URL query with zod (`person`, `action`, `entity`, `role`, `demo`, `from`, `to`, `before`): valid values, unknown action rejected, bad uuid rejected, bad date rejected, `demo` defaults to false (D9), dates treated as whole days in the viewer's timezone (`to` becomes the exclusive next day start).
- [ ] A067 [P] [US3] Extend `tests/e2e/audit.spec.ts`: admin sees all entries newest first with demo hidden by default and shown with the filter (D9); each filter narrows the list; Export CSV downloads a file whose row count equals the filtered list; employee and manager get the forbidden page for `/admin/audit` and a 403 for `/admin/audit/export`; the nav and tab link are hidden for non-admins.
- [ ] A068 [P] [US3] `scripts/seed-audit-volume.ts`: generates 50,000 fictional `audit_log` rows (invented names, no real data, no emails) as the database owner on the **local** database only, refuses to run if the URL is not `127.0.0.1`/`localhost`. Add `"seed:audit-volume"` to `package.json`. Seeds through `private.audit_write` or a direct insert with `set session_replication_role = replica`.

### Implementation for User Story 3

- [ ] A069 [US3] Migration `supabase/migrations/<ts>_audit_search_export.sql`: `private.audit_matches(a public.audit_log, p_person, p_action, p_entity, p_role, p_demo, p_from, p_to)` (`security invoker`, `stable`); `public.audit_search(...)` per database-api.md (admin check first, `not_allowed`; keyset order `(created_at desc, id desc)`; limit capped at 100); `public.audit_export_csv(<filters>, p_tz text, p_limit int default 10000)` returning `{ csv text, row_count int, truncated boolean }` built with `string_agg`, `to_char(created_at at time zone p_tz, 'YYYY-MM-DD HH24:MI:SS')`, validated against `pg_timezone_names`, formula-neutralising prefix, selecting `p_limit + 1` rows to compute `truncated`. All `security invoker`; `revoke all … from public, anon`; `grant execute … to authenticated`.
- [ ] A070 [US3] `src/server/audit.ts`: add `AuditFilters` zod schema and `parseFilters(searchParams, timeZone)` (A066), `fetchAudit(filters, cursor)` calling `audit_search`, and `exportAuditCsv(filters, timeZone)` calling `audit_export_csv`. One database call each.
- [ ] A071 [P] [US3] `src/components/audit/filter-bar.tsx`: a GET `<form>` writing person (select of people), action, entity, role, demo/real (default Real), from and to into the URL query so views are shareable; labelled fields, keyboard operable, stacks at phone width; "Reset" link; "Export CSV" link carrying the same query.
- [ ] A072 [US3] `src/app/(app)/admin/audit/page.tsx`: admin-only (reuse the guard and `src/components/forbidden.tsx` pattern from `src/app/(app)/admin/layout.tsx`); parses filters, calls `fetchAudit`, renders `FilterBar`, the entry list (A057) with a "capped at 10,000 rows" note when the export header says so, and the empty and error states.
- [ ] A073 [US3] `src/app/(app)/admin/audit/export/route.ts`: `GET`, user session client (never the secret key), `parseFilters`, `exportAuditCsv`; returns `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="away-audit-<yyyy-mm-dd>.csv"`, `X-Audit-Truncated`. 403 on `not_allowed`, 400 on invalid filters.
- [ ] A074 [P] [US3] Add `{ href: "/admin/audit", label: "Audit" }` to `TABS` in `src/app/(app)/admin/admin-tabs.tsx`.
- [ ] A075 [US3] Performance check (SC-008, quickstart step 6): `npm run db:reset`, `npm run seed:audit-volume`, then time `audit_my_history`, a filtered `audit_search` page and a 10,000-row `audit_export_csv` as employee, manager and admin. Record the numbers in the PR. Pages under 2 s, export under 30 s. If the manager or employee policy path is too slow, switch the policy to the inline `exists (…)` form with `(select private.current_role())` from research R6 in a new migration, and add `docs/decisions/0018-audit-policy-inline.md`.
- [ ] A076 [P] [US3] Add `/admin/audit` to the axe checks in `tests/e2e/a11y.spec.ts` and the phone-width check in `tests/e2e/mobile.spec.ts`.
- [ ] A077 [P] [US3] Regenerate `src/lib/database.types.ts`; run the full suite. Open PR "feat: admin Audit page and CSV export (slice 4)".

**Checkpoint**: all four stories work.

---

## Phase 7: Polish and cross-cutting

- [x] A078 [P] Update `docs/ROADMAP.md` with the feature 002 slices and statuses; tick each as its PR merges.
  *#363, merged as `a16bb12`. Re-read against `main` at `1b3e35b`: slice 1 ticked, slices 2b, 3 and 4 open, and slice 2 part-built — three of its A034–A044 tasks are in, A035 as #373 (`cf50636`), A036 as #378 (`0932edb`) and A037 as #379 (`5a757f8`) — with A034 the only one in review, as #371, and A038–A044 not started: A038 is the backfill function, so #371 carries its assertions guarded until it lands. So slice 2's line stays unticked, and the commits are named next to the PR numbers because this sentence has already gone stale once by quoting numbers alone.*
- [x] A079 [P] Add a "migrations that rewrite audited tables" note to the PR template or `docs/` (quickstart "Notes for migrations"): any later migration touching `profiles`, `leave_requests`, `allowance_overrides` or `leave_types` states how it avoids false entries.
  *#368, merged as `779eed6`: the note is the "Notes for migrations" section of [quickstart.md](quickstart.md), and one checklist line in `.github/pull_request_template.md` makes every PR say it.*
- [x] A080 Walk through every step of `specs/002-transaction-audit/quickstart.md` (1–6) on a clean local database and fix any step that is wrong.
  *Walked on a clean local database on 2026-11-17. Six statements on the page did not survive running them and #370, merged as `7857562`, corrected them and recorded the measured counts. Two more came out of the same walk: the step-6 function list, which #370 itself introduced — six names where `pg_proc` reports seven — and the step-1 e2e prerequisite, which was wrong from #351 and only states a condition, not the command; #374, merged as `71b1797`, fixed both, the latter to `set -a; . ./.env.local; set +a`, because Playwright loads no env file while `vitest.integration.config.ts` does.*
- [ ] A081 Public-repo check: grep the diff for emails, keys and real names; confirm the 50k seed contains only generated data and `docs/journey/raw/` is untouched.
- [ ] A082 After each slice, per CLAUDE.md Definition of Done: run lint, typecheck and tests, run the `session-journal` skill, then the `next-step` skill and show its block.
  *Not ticked, and the reason is not the missing skills. The first step is done: every PR merged to `main` since #354 up to `cf50636` — #362, #363, #367, #368, #370, #373, #374, #378 — reports `lint`, `typecheck`, `unit`, `build`, `e2e` and `db` as pass, with `integration` and `review` alongside, and `enforce_admins` is on, so a merge cannot happen without them; the same commands run locally on `main` during the A080 walk are the numbers recorded in [quickstart.md](quickstart.md). The `session-journal` and `next-step` steps were not performed and stay open: they need two Claude skills that are not installed in this runtime (Sam's install list) and are not being ported mid-sprint, so the third step — "show its block" — has nothing to show. A082 is otherwise complete on the sweep evidence; that is the whole of #347's remaining scope.*

---

## Dependencies and execution order

```text
Phase 1 Setup
   └─► Phase 2 Foundational (T003–A011)
          └─► Phase 3 US1, slice 1 (T012–A033)  ◄── MVP, PR 1
                 ├─► Phase 4 US4, slice 2 (T034–A044)  PR 2
                 │       └─► Phase 4b, migration B (T045–A050)  PR 5, after production check
                 └─► Phase 5 US2, slice 3 (T051–A062)  PR 3
                         └─► Phase 6 US3, slice 4 (T063–A077)  PR 4
Phase 7 Polish: after the slices it touches
```

- Slice 2 and slice 3 are independent of each other and can be built in parallel after slice 1. They share only `src/lib/database.types.ts`; regenerate it after rebasing.
- Slice 4 needs slice 3's `src/server/audit.ts` and `src/components/audit/`.
- Migration B needs slice 2 in production and A045.
- Within a phase: tests fail first, then migrations in order, then app code.

## Parallel examples

```text
# Phase 2 tests (different files):
A003 row36, A004 row37, A005 row38, A006 row39, A007 row40, A008 audit_actor

# Phase 3 tests (all different files):
T012–A019 rows 28–35, T020–A025 event, retention and demo tests

# After slice 1, two people / agents:
Slice 2 (T034–A044)  ‖  Slice 3 (T051–A062)

# Slice 2 reader switches (three different files):
A041 page.tsx, A042 approvals/page.tsx, A043 admin/users/[id]/page.tsx
```

## Implementation strategy

1. **MVP = slice 1** (Phases 1–3). The log records everything and is tamper-proof. Even with no screen, this stops the data gap growing, which is the part that cannot be added later (spec US1 rationale). Verify with the pgTAP suite and quickstart steps 1–3.
2. Then slices 2 and 3 in either order, then slice 4, then migration B.
3. Each slice merges only with the full CI suite green and the existing 001 tests unchanged (SC-009), except the tests deliberately edited in A035, A036 and Phase 4b.
4. Budget stays $0: no new service or dependency in any task. The one `package.json` change is a script entry (A068).

## Notes

- Do not change balance maths, decision rules or any 001 RPC signature (FR-011). `admin_set_allowance` changes behaviour only (A039).
- Never use `to_jsonb(row)` for `before`/`after`.
- Never read or write `audit_log` with the secret key; tests that need to read as owner use the pgTAP superuser session.
- Commit after each task or logical group; conventional commits; branch per slice (`feat/audit-log-record`, `feat/audit-carry-over`, `feat/audit-my-history`, `feat/audit-admin-page`, `chore/drop-allowance-changes`).

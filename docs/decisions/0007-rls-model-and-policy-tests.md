# 0007 RLS model: role helpers, private calendar function, pgTAP tests

**Status:** accepted · 2026-10-16

## Context
Constitution III makes the database the access control. The spec needs role rules
(FR-017–FR-019, US6-5), colleague privacy (FR-024a: colleagues see name, dates and
status only), demo rules (FR-030–FR-032, now a flag rather than a partition, ADR 0004)
and server-side working-day counts that can't be faked. Postgres RLS works on rows,
but FR-024a hides columns.

## Decision
- **RLS is on for every table in `public`.** `anon` gets nothing. `authenticated` gets
  `SELECT` through policies, and direct writes only where a plain policy is the whole
  rule: admins editing leave types, regions and holidays, and users updating their own
  `region_code` and `timezone` through column grants.
- **Role helpers** live in a `private` schema that the API doesn't expose:
  `private.current_role()` and `private.is_admin()` / `is_approver()`. They are
  `security definer`, `stable`, `search_path = ''`, read `profiles` for
  `auth.uid()`, and return null for inactive users. Roles come from the table rather
  than JWT claims, so a role change or deactivation applies on the next query.
- **Business writes go through RPC functions** in `public` (`submit_leave_request`,
  `decide_leave_request`, `admin_set_allowance`, `admin_*` user functions). Each one
  is `security definer`, checks the caller with the same helpers, and gets
  `execute` granted to `authenticated` only. That keeps working days, the decider and
  timestamps out of the client's hands, and gives stable error codes. `leave_requests`,
  `allowance_overrides` and `allowance_changes` have **no** insert, update or delete
  grants for clients.
- **Colleague privacy** is enforced by a narrow read. Clients can read
  `leave_requests` rows only for themselves, or for everyone if they are a manager or
  admin. The team calendar reads through `team_calendar(from, to)` (security definer),
  which returns name, dates and status for everyone. It adds leave type only when the
  caller is the requester, a manager or an admin. Notes and decision comments never
  appear in the calendar.
- **Race safety lives in the database:** an exclusion constraint (`btree_gist`)
  blocks overlapping pending or approved requests for the same user, and a decision
  is `UPDATE … WHERE status = 'pending'`, so the first decision wins.
- **Testing:** pgTAP via `supabase test db`, in `supabase/tests/`. A small local
  helper file (no third-party package) creates users and switches between `anon`
  and `authenticated` with the right claims, inside a rolled-back transaction. Every
  row of `specs/001-mvp/contracts/access-matrix.md` has one allowed case and one
  refused case. The tests run locally (Docker) and in CI on every PR, and they block
  merges.

## Consequences
- The access matrix is the single checklist. A new table or role needs new rows and
  tests in it.
- Security definer functions are where a mistake would be expensive, so each one has
  a test for the caller it must refuse, and `search_path` is pinned.
- Supabase's database linter is run in CI (`supabase db lint`) to catch tables
  without RLS and mutable search paths.

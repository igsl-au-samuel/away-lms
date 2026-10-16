# Handoff → Session 14: pgTAP user helpers + private helpers + whoami (T027–T030)

**Model:** sonnet · **Effort:** medium (use plan mode: schema/auth)

## State
T024–T026 done on `feat/t024-schema` (3 migrations, RLS on, no policies). Branch not yet
pushed/PR'd. Docker Desktop must be running (`%LOCALAPPDATA%\Programs\DockerDesktop`).

## Goal
Test-first, per `specs/001-mvp/tasks.md`:
- T027 extend `supabase/tests/00_helpers.sql`: `tests.create_user(role, region, active, demo)`, `tests.create_request(...)`
- T028 `rls_enabled.sql` · T029 `whoami.sql` (confirm it fails)
- T030 migration `*_private_helpers.sql`: schema `private`, `current_role()`, `is_admin()`, `is_approver()`, `whoami()`

## Files to open
`specs/001-mvp/tasks.md` (T027–T030) · `specs/001-mvp/contracts/database-api.md` ·
`specs/001-mvp/contracts/access-matrix.md` · `supabase/tests/00_helpers.sql` ·
`supabase/migrations/20261017000200_profiles.sql`

## Decisions to respect
- Authorization lives in Postgres; every policy has pgTAP tests (access matrix rows).
- Functions: `security definer`, `set search_path = ''`, revoke from public (see health migration).
- Deferred: `leave_types` default-change trigger (needs `changed_by`) → with admin RPCs (T047).

## Don't
Touch Cloudflare, T017, or write RLS policies yet (T045+; best done in a fresh Opus/high session).

## Waiting on Sam (skipped for now)
Merge #199 + secret/app; `db` in branch protection (T022); T010/T011; T017.

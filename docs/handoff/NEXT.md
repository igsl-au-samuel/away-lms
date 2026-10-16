# Handoff → Session 14: reference seed (T031–T032), then holiday seeds (T033–T035)

**Model:** sonnet · **Effort:** medium

## State
T024–T030 done on `feat/t024-schema` (5 migrations through `20261017000500`; 28 pgTAP tests pass,
`db lint` clean). Branch not yet pushed/PR'd. Docker Desktop must be running.

## Goal
Test-first, per `specs/001-mvp/tasks.md`:
- T031 `supabase/tests/seed_reference.sql` (confirm it fails)
- T032 migration `*_seed_reference.sql` (idempotent, `on conflict do nothing`): regions QLD/NSW/HK, leave types Annual 20 / Personal-Sick 10 / Unpaid uncapped
- T033–T035 holiday seeds 2026+2027 (QLD incl. Ekka, NSW, HK), cite official sources in header (ADR 0008). Web lookup needed for dates.

## Files to open
`specs/001-mvp/tasks.md` (T031–T035) · `specs/001-mvp/data-model.md` · `supabase/migrations/20261017000100_enums_and_reference.sql` · `docs/decisions/0008*`

## Decisions to respect
- `tests.create_user` auto-creates its region with `on conflict do nothing`, so seeded regions coexist with fixtures.
- anon has no write grants (migration 000500); keep it that way.
- Deferred: `leave_types` default-change trigger (needs `changed_by`) → with admin RPCs (T047).

## Don't
Touch Cloudflare, T017, or write RLS policies yet (T045+; best in a fresh Opus/high session).

## Waiting on Sam (skipped for now)
Merge #199 + secret/app; `db` in branch protection (T022); T010/T011; T017. Push branch + open PR for T024–T030.

# Handoff → Session 15: access-matrix tests (T036–T044), then policies (T045+)

**Model:** opus · **Effort:** high (plan mode — schema/auth work)

## State
T024–T035 done on `feat/t024-schema` (9 migrations through `20261017000900`; 37 pgTAP tests
pass, `db lint` clean). Seeds: regions QLD/NSW/HK, 3 leave types, 2026+2027 holidays (non-Sunday
dates only). Work from this session (T031–T035) is **uncommitted**. Branch not yet pushed/PR'd.
Docker Desktop must be running.

## Goal
Test-first per `specs/001-mvp/tasks.md`: T036–T044 (rows 1–9 pgTAP tests, all `[P]`), confirm they
fail, then T045+ policies/RPCs make them pass.

## Files to open
`specs/001-mvp/tasks.md` (T036–T050) · `specs/001-mvp/contracts/access-matrix.md` ·
`specs/001-mvp/data-model.md` · `supabase/tests/00_helpers.sql` · `supabase/tests/whoami.sql` (pattern)

## Decisions to respect
- `tests.create_user` auto-creates its region with `on conflict do nothing`; seeded regions coexist.
- anon has no write grants (migration 000500); keep it that way.
- Deferred: `leave_types` default-change trigger (needs `changed_by`) → with admin RPCs (T047).
- Seed tests assume exact holiday counts; changing seeds means updating `seed_reference.sql`.

## Don't
Touch Cloudflare or T017.

## Waiting on Sam
Commit + push branch and open PR for T024–T035. Spot-check HK 2027 dates against gov.hk (fetch returned
empty; sourced from press release/aggregator). Merge #199 + secret/app; `db` in branch protection (T022); T010/T011; T017.

# Handoff → Session 17: generated DB types (T049), then app plumbing (T050–T053)

**Model:** sonnet · **Effort:** medium

## State
Phase 2 DB work done: T024–T048. Stacked PRs: #203 (schema + seeds, `feat/t024-schema`) and
PR #204 on top of it (rows 1–9 tests, policies, admin RPCs, `feat/t036-access-policies`).
14 pgTAP files, 153 tests pass; `db lint` clean. Docker Desktop must be running.

## Goal
1. T049: add a `types:gen` npm script (`supabase gen types typescript --local`) and commit
   `src/lib/database.types.ts`.
2. T050–T053 test-first: `tests/unit/dates.test.ts` → `src/lib/dates.ts`;
   `tests/unit/errors.test.ts` → `src/lib/errors.ts` (codes: `not_allowed`, `not_found`,
   `profile_exists`, `cannot_change_own_role`, `cannot_deactivate_self`, `demo_must_be_employee`).
Done when lint, typecheck, `npm test` and `supabase test db` pass.

## Branch
`feat/t049-types-plumbing` from `feat/t036-access-policies` (or from `main` if #203/#204 merged).

## Files to open
`specs/001-mvp/tasks.md` (T049–T053) · `specs/001-mvp/contracts/database-api.md` (error convention)
· `package.json` · `src/lib/` (existing files only)

## Decisions to respect
- ADR 0009: grants hardened below RLS. Any new RPC needs `revoke all … from public, anon`.
- RPC errors: `P0001`, message = code, detail = plain English. The UI maps the code to copy.
- Dates: `Intl.DateTimeFormat('en-AU', { timeZone })`, no date library.

## Don't
Touch Cloudflare, T017, or the migrations.

## Waiting on Sam
Review/merge #203 then #204 (retarget #204 to `main` after #203 merges; its "Closes" lines only
fire on `main`). Spot-check HK 2027 holidays against gov.hk. Merge #199 + secret/app; `db` check in
branch protection (T022); T010/T011; T017.

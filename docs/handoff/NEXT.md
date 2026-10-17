# Handoff → Session 23: US2 request leave, tests first (T092–T100)

**Model:** opus plans (schema + RPCs, plan mode) → sonnet builds · **Effort:** high → medium

## State
T060–T089 done on `feat/t054-clients-tokens` (PR #209, ready for review). Dashboard, balances, allowance log, e2e balances spec and CI `e2e`/`integration` jobs are in. Lint, typecheck, unit (45), integration (7), pgTAP (208) and e2e (6) pass locally. The CI jobs are untested until they run on GitHub (assumes `supabase status -o env` exposes `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`).
Local e2e: `set -a; . ./.env.local; set +a; npm run seed:local -- --password "$E2E_PASSWORD"; npm run test:e2e`.
Sam still owes T090/T091 (hosted auth, deployed smoke check) and adding `integration` to the required checks.

## Goal
Start Phase 4 / US2 in `specs/001-mvp/tasks.md`: write the failing tests T092–T100 (pgTAP rows 10–12, `count_working_days`, validation, stored values, concurrent submit, request schema, e2e), then T101–T107 migrations and UI. Consider a fresh branch off `main` after PR #209 merges.

## Files to open
`specs/001-mvp/tasks.md` (T092–T107) · `specs/001-mvp/contracts/access-matrix.md` · `specs/001-mvp/contracts/database-api.md` · `supabase/tests/00_helpers.sql` · `supabase/migrations/20261017000300_requests_and_allowances.sql`

## Decisions to respect
- Approved `leave_requests` rows need `decided_by` and `decided_at` (check constraint) in direct test inserts.
- New tables: `revoke select ... from anon` (pattern in `…001600_policies_allowances.sql`).
- E2E alert locators must filter by text. Use the Write tool for many files.
- `SeededUser` in `tests/e2e/fixtures.ts` is a plain `{email,name,role}`.

## Don't
Touch Cloudflare, T017 or existing migrations.

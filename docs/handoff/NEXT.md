# Handoff → Session 22: US1 dashboard + e2e + CI (T085–T089)

**Model:** sonnet · **Effort:** medium

## State
T060–T084 done and pushed on `feat/t054-clients-tokens` (PR #209 open). Lint, typecheck, unit (45), integration (7), pgTAP (208) and e2e (5) pass.
Signed-in landing route is `/` (`src/app/(app)/page.tsx`, currently a bare "Dashboard" heading). Auth UI, `(app)` shell + nav, admin users page and `/auth/confirm` exist.
Local e2e: `set -a; . ./.env.local; set +a; npm run seed:local -- --password "$E2E_PASSWORD"; npm run test:e2e`.

## Goal
1. T085 `src/components/balances.tsx`, T086 `src/components/allowance-log.tsx` (parallel-safe).
2. T087 dashboard at `(app)/page.tsx`: `get_balances` for the current leave year in the viewer's timezone (`src/lib/dates.ts`) + own allowance log. Keep a visible `h1` "Dashboard"; don't repeat the name/role text the sidebar already shows (e2e uses `getByText(name)` strictly).
3. T088 `tests/e2e/balances.spec.ts`; T089 CI `e2e` + `integration` jobs.
T090/T091 are manual (Sam). Then tick "Auth + roles" in `docs/ROADMAP.md` and mark PR #209 ready.

## Files to open
`specs/001-mvp/tasks.md` (T085–T089) · `docs/design/DIRECTION.md` · `src/lib/dates.ts` · `src/server/auth.ts` (`getRequestViewer`) · `tests/e2e/fixtures.ts` · `.github/workflows/ci.yml`

## Decisions to respect
- Negative available shows "−2 days (over)" as text, not colour alone. Uncapped types: taken and pending only.
- `anon` select must be revoked on new tables (migration pattern in `…001600_policies_allowances.sql`).
- E2E alert locators must filter by text (Next's route announcer is also `role="alert"`).
- Use the Write tool for many files; long bash heredocs failed silently.

## Don't
Touch Cloudflare, T017, or existing migrations.

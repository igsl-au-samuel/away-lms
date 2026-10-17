# Handoff → Session 27: US5 profile (Phase 7)

**Model:** sonnet · **Effort:** medium (small slice; no new RPC, so no plan mode needed unless the schema changes)

## State
US4 is done: T126–T134 ticked. Branch `feat/t126-team-calendar` (based on `feat/t111-approvals`, PR #211, which is based on #210) is committed and pushed as PR #212 (base `feat/t111-approvals`). Lint, typecheck, unit 86, integration 9, pgTAP 384 and e2e 9 pass. #209, #210, #211 and #212 are open. The calendar has been checked by e2e only, not by eye at phone width.

## Goal
Phase 7 in `specs/001-mvp/tasks.md` (User Story 5, profile region and timezone, T135–T139). Tests first (T135–T137, confirm they fail), then T138 schema + `updateProfile` action, then T139 `/profile` page.

## Done when
The Phase 7 checkpoint passes (counts follow the region, dates follow the timezone, FR-026), plus lint, typecheck, unit, integration, pgTAP and e2e. Tick the tasks.

## Files to open
`specs/001-mvp/tasks.md` (Phase 7 only) · `supabase/migrations/20261017001100_policies_profiles.sql` (the user may update only `region_code` and `timezone`) · `supabase/migrations/20261017002000_submit_leave_request.sql` (which region a new request uses) · `src/lib/schemas.ts` · `src/actions/requests.ts` (action pattern) · `src/server/auth.ts` (`getRequestViewer`) · `tests/e2e/fixtures.ts`

## Decisions to respect
- Authorization lives in Postgres: a profile update is a plain `profiles` update of the two permitted columns; no new RPC expected.
- ADR 0008: working days and timezones; a stored working-day count never changes after a region change.
- `team_calendar` returns the person's current region (session 26); a region change moves them between calendar groups.
- Don't change existing RPC signatures or `ERROR_COPY` text without updating the tests.
- Branch US5 from `feat/t126-team-calendar` (PRs #210, #211 and #212 are stacked, not merged).

## Local environment gotchas
- `next build` runs out of memory locally: add `experimental: { cpus: 2 }` to `next.config.ts` and don't commit it.
- Playwright: `set -a; . ./.env.local; set +a` first, and use `--workers=1`.
- `npm run db:reset` deletes the seeded users: rerun `npm run seed:local -- --password "$E2E_PASSWORD"` before e2e.
- Use the Write tool for files under `src/app/(app)/`; shell heredocs choke on the parentheses.
- psql `\gset` lines can't carry a trailing `-- comment`.

## Don't
Touch Cloudflare or T017.

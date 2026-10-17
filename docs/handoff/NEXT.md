# Handoff → Session 28: US6 admin settings and demo data (Phase 8)

**Model:** opus plans → sonnet builds · **Effort:** high for the plan (touches schema, auth and >3 files), then medium

## State
US5 is done: T135–T139 ticked. Branch `feat/t135-profile` (based on `feat/t126-team-calendar`, PR #212, stacked on #211 and #210) is committed locally; no PR yet. Lint, typecheck, unit 90, integration 9, pgTAP 392 and e2e 10 pass. The profile page and calendar were checked by e2e only, not by eye at phone width.

## Goal
Phase 8 in `specs/001-mvp/tasks.md` (User Story 6, T140–T153+): admin leave types, allowances, holidays, demo data. Tests first (T140–T147, confirm they fail), then the leave-type default log migration (T148), types (T149), then roster, loader, actions, script, pages.

## Done when
The Phase 8 checkpoint passes, plus lint, typecheck, unit, integration, pgTAP and e2e. Tick the tasks.

## Files to open
`specs/001-mvp/tasks.md` (Phase 8 only) · `specs/001-mvp/contracts/access-matrix.md` (rows 5–9, 22) · `src/actions/admin-users.ts` (action pattern) · `src/server/auth.ts` (`assertAdmin`) · `scripts/lib/local-guard.ts` · `tests/integration/helpers.ts`

## Decisions to respect
- Authorization lives in Postgres; demo users are employees only (D1) and never read real requests (D2).
- The loader never touches a non-demo row (SC-007); no password literal in the repo; the repo is public.
- Branch US6 from `feat/t135-profile`. PRs are stacked, not merged.

## Local environment gotchas
- `next build` runs out of memory locally (intermittent): add `experimental: { cpus: 2 }` to `next.config.ts`, rerun on failure, don't commit it.
- Playwright: `set -a; . ./.env.local; set +a` first, and use `--workers=1`.
- `npm run db:reset` deletes the seeded users: rerun `npm run seed:local -- --password "$E2E_PASSWORD"` before e2e.
- Use the Write tool for files under `src/app/(app)/`; shell heredocs choke on the parentheses.
- psql `\gset` lines can't carry a trailing `-- comment`.
- `\b` in a JS template literal is a backspace: use `String.raw`.

## Don't
Touch Cloudflare or T017.

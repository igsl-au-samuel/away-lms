# Handoff → Session 26: US4 team calendar (Phase 6)

**Model:** sonnet · **Effort:** high for the plan; medium for the build

## State
US3 is done: T111–T125 ticked. Branch `feat/t111-approvals` (based on `feat/t092-request-leave`, PR #210) is **committed nowhere yet**: changes are uncommitted in the working tree and no PR is open. Lint, typecheck, unit 65, integration 9, pgTAP 354 and e2e 8 pass. #209 and #210 are still open.

## Goal
Start Phase 6 in `specs/001-mvp/tasks.md` (User Story 4, team calendar across regions, T126–T134). Tests first. Plan mode first: it adds an RPC (`team_calendar`).

## Done when
The Phase 6 checkpoint in tasks.md passes, plus lint, typecheck, unit, integration, pgTAP and e2e. Tick the tasks.

## Files to open
`specs/001-mvp/tasks.md` (Phase 6 only) · `specs/001-mvp/contracts/access-matrix.md` (rows 18–19) · `specs/001-mvp/contracts/database-api.md` (`team_calendar`) · `supabase/migrations/20261017002300_approval_queue.sql` (RPC pattern) · `src/components/badges.tsx`

## Decisions to respect
- Authorization lives in Postgres: RLS plus security definer RPCs, with pgTAP tests per access-matrix.
- ADR 0010: only the approval RPCs narrow FR-018; `team_calendar` is open to any active user.
- Don't change existing RPC signatures or `ERROR_COPY` text without updating the tests.
- Ask Sam whether to commit the US3 work and open its PR before branching.

## Local environment gotchas
- `next build` runs out of memory locally: add `experimental: { cpus: 2 }` to `next.config.ts` and don't commit it.
- Playwright: `set -a; . ./.env.local; set +a` first, and use `--workers=1` (parallel workers crash here).
- `npm run db:reset` deletes the seeded users: rerun `npm run seed:local -- --password "$E2E_PASSWORD"` before e2e.
- Use the Write tool for files under `src/app/(app)/`; shell heredocs choke on the parentheses.

## Don't
Touch Cloudflare or T017.

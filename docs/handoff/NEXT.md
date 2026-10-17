# Handoff → Session 25: US3 approve or decline (Phase 5)

**Model:** sonnet · **Effort:** high for the plan; medium for the build

## State
US2 is done: T092–T110 ticked, PR #210 open (base `feat/t054-clients-tokens`, itself #209, still open). Lint, typecheck, unit 57, integration 8, pgTAP 296 and e2e 7 pass.

## Goal
Start Phase 5 in `specs/001-mvp/tasks.md` (User Story 3, approve or decline requests). Follow the file's task order, tests first. Plan mode first: it touches the schema and auth.

## Done when
The Phase 5 checkpoint in tasks.md passes, plus lint, typecheck, unit, integration and e2e. Tick the tasks.

## Files to open
`specs/001-mvp/tasks.md` (Phase 5 only) · `specs/001-mvp/contracts/access-matrix.md` · `src/actions/requests.ts` (pattern) · `src/components/badges.tsx`

## Decisions to respect
- Authorization lives in Postgres: RLS plus security definer RPCs, with pgTAP tests per access-matrix.
- Don't change the existing RPC signatures or the `ERROR_COPY` text without updating the tests.
- Rebase on `main` if #209 and #210 have merged.

## Local environment gotchas
- `next build` runs out of memory at "Generating static pages using 10 workers" on this machine. Locally add `experimental: { cpus: 2 }` to `next.config.ts`, and don't commit it.
- Playwright doesn't load `.env.local`. Run `set -a; . ./.env.local; set +a` first.

## Don't
Touch Cloudflare or T017.

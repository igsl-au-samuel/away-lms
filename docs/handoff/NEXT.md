# Handoff → Session 19: Auth integration tests and US1 setup (T060–T063)

**Model:** sonnet · **Effort:** medium

## State
T024–T059 done. Phase 2 plumbing is complete on `feat/t054-clients-tokens` (commit 22897d8, not pushed;
open the PR first, branch from `feat/t049-types-plumbing` if that PR is unmerged).
Lint, typecheck, 30 unit tests, 153 pgTAP tests and `next build` pass. Docker Desktop must be running.
`npm run seed:local -- --password <pw>` seeds admin/manager/employee1/employee2 @away.test (region QLD).

## Goal
T060 integration test setup, T061 `tests/integration/auth.test.ts`, T062 `tests/unit/schemas-auth.test.ts`,
T063 e2e fixtures + login spec. Test-first; confirm failures before implementing.
Done when lint, typecheck, `npm test`, `npm run test:integration` and `supabase test db` pass.

## Files to open
`specs/001-mvp/tasks.md` (T060–T063) · `src/server/auth.ts` · `src/lib/supabase/` · `package.json` · `.env.example`

## Decisions to respect
- Integration helpers refuse a non-local URL (reuse `scripts/lib/local-guard.ts`); alias `server-only` to an empty stub.
- Tests import with relative paths (no `@/` alias). Tests read the password from `E2E_PASSWORD`.
- `auth.getUser()`, never `getSession()` alone.

## Don't
Touch Cloudflare, T017, or the migrations.

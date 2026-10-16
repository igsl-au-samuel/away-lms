# Handoff → Session 18: Supabase clients, admin helpers, tokens (T054–T059)

**Model:** sonnet · **Effort:** medium

## State
T024–T053 done. `types:gen` script, `src/lib/database.types.ts`, `src/lib/dates.ts` and
`src/lib/errors.ts` are on `feat/t049-types-plumbing` (not yet committed or pushed; open the PR first).
#203/#204 are merged. 153 pgTAP tests and 15 unit tests pass. Docker Desktop must be running.

## Goal
Finish Phase 2 plumbing, test-first where the task says so:
- T054 Supabase browser/server clients + session refresh in `src/proxy.ts`
- T055 `src/server/supabase-admin.ts`, `src/server/auth.ts` (`getViewer`, `assertAdmin`, `requireAdmin`)
- T056 Ledger tokens and IBM Plex fonts
- T057 `src/components/badges.tsx` + test
- T058/T059 local guard test, then `scripts/lib/local-guard.ts` and `scripts/seed-local.ts`
Done when lint, typecheck, `npm test` and `supabase test db` pass.

## Branch
New branch from `feat/t049-types-plumbing` (or `main` once its PR merges).

## Files to open
`specs/001-mvp/tasks.md` (T054–T059) · `docs/design/DIRECTION.md` · `src/proxy.ts` · `src/app/` ·
`package.json` · `.env.example`

## Decisions to respect
- Publishable key in browser/server clients; secret key only in `src/server/` with `server-only`.
- Use `auth.getUser()`, never `getSession()` alone (research R3).
- Tests import with relative paths (no `@/` alias is configured).
- Seed password comes from a flag or prompt, never a committed file.

## Don't
Touch Cloudflare, T017, or the migrations. Adding `@supabase/ssr`, `@supabase/supabase-js`,
`server-only` and Lucide is expected (all free).

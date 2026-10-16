# Handoff → Session 08: database pipeline (issue #16, T012)

**Model:** sonnet · **Effort:** medium · Plan mode first (schema + auth config).

## State
Merged: scaffold, ESLint (strict TS), Vitest, Playwright, `.env.example`, OpenNext +
Wrangler, pass-through `src/proxy.ts` (R3 proven locally), CI (lint/typecheck/unit/
build:worker/e2e, green). Sam said: merge PRs yourself until the planned demo.

## Goal
Issue #16 (T012): `npx supabase init`, pin `supabase` CLI as a devDependency,
`enable_signup = false`, local mail on Mailpit, scripts `db:start`, `db:reset`,
`db:test`, `db:lint` (full wording in `specs/001-mvp/tasks.md` T012).
Then, if smooth: #17 (T013 pgTAP helpers), #18 (T014 failing health test),
#19 (T015 `health()` migration), #20 (T016 CI `db` job). Check each issue's Dependencies.

## Done when
`npm run db:start` / `db:test` work locally (needs Docker running; check first with
`docker info`), PR merged with `Closes #16`. Then `session-journal` → `next-step`.

## Files to open
Issue #16 · `specs/001-mvp/tasks.md` (T012–T016) · `specs/001-mvp/contracts/database-api.md` ·
`specs/001-mvp/contracts/access-matrix.md` (row 25) · ADR 0006 (auth/invites)

## Decisions to respect
- Authorization lives in Postgres; every policy gets pgTAP tests. Test first (T014 fails before T015).
- `health()` is `security definer`, `set search_path = ''`, touches no tables.
- Branch per task, Conventional Commits, PR with `Closes #N`. Don't commit secrets or `.env*`.
- Check `git status` before committing (a `tsbuildinfo` slipped in once).

## Don't
- Link or create the hosted Supabase project (T017 is manual, Sam's), touch Cloudflare, or add paid services.

## Waiting on Sam (not blocking T012)
- T010/T011: Cloudflare Workers Builds project + preview check.
- Branch protection on `main`. Not enabled by me because required human approval would
  block my self-merges. Decide whether to require only CI until the demo.

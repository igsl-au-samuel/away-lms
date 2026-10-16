# Handoff → Session 09: pgTAP + health() + CI db job (issues #17–#20, T013–T016)

**Model:** sonnet · **Effort:** medium · Plan mode first (schema + auth).

## State
T012 (#16) merged (PR #195): `supabase` 2.121.0 pinned, `supabase/config.toml` with
`enable_signup = false` (auth + auth.email), scripts `db:start|reset|test|lint`.
Not yet run locally: Docker is NOT installed on Sam's machine.

## Blocker (check first)
Run `docker info` (PowerShell). If missing/not running, stop and tell Sam to install and
start Docker Desktop. Don't write pgTAP tests you can't run (T014 must fail before T015).

## Goal
#17 (T013) `supabase/tests/00_helpers.sql` → #18 (T014) failing `row25_health.sql` →
#19 (T015) `*_health.sql` migration → #20 (T016) CI `db` job. Check each issue's Dependencies.
First confirm `npm run db:start` and `db:test` work.

## Files to open
`specs/001-mvp/tasks.md` (T013–T016) · `specs/001-mvp/contracts/database-api.md` ·
`specs/001-mvp/contracts/access-matrix.md` (row 25) · ADR 0006

## Decisions to respect
- Authorization lives in Postgres; every policy has pgTAP tests. Test first.
- `health()`: `security definer`, `set search_path = ''`, touches no tables, executable by anon + authenticated.
- Schema/auth changes: stop and ask Sam (T015 is the first migration).
- Branch per task, Conventional Commits, `Closes #N`; self-merge after CI is green.
- `git status` before committing.

## Don't
Link/create the hosted Supabase project (T017 is Sam's), touch Cloudflare, add paid services.

## Waiting on Sam
Docker Desktop · T010/T011 Cloudflare Workers Builds · branch protection decision.

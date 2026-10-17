# Handoff → Session 37: Build Google Calendar sync (issue #225)

**Model:** sonnet · **Effort:** medium. The plan is agreed. Build it as written.

## State
- Branch `feat/calendar-sync` is stacked on `chore/supabase-mcp-dev` (PR #224, not merged yet).
  If #224 has merged, rebase onto `main` before opening the PR.
- The plan is in `docs/spec/CALENDAR-SYNC.md` and the decision in ADR 0013. Both are committed.

## Goal
Build the outbox → pg_cron → Edge Function → Calendar API sync exactly as the plan describes.
Open the PR with `Closes #225`.

## Done when
- The migration, Edge Function (`index.ts` + `lib.ts`), config, pgTAP tests, unit tests,
  access-matrix rows 26–27, types regen and the `deploy-db.yml` function deploy step are all in.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run db:test` pass.
- The local end-to-end check is done, or clearly listed as blocked on Sam's Google setup (service
  account key and shared test calendar).

## Open first
- `docs/spec/CALENDAR-SYNC.md`, which is the full spec for this task
- `supabase/migrations/20261017002200_decide_leave_request.sql` for the RPC style and grants
- `supabase/migrations/20261017000300_requests_and_allowances.sql` for `leave_requests`
- `supabase/tests/00_helpers.sql` and `supabase/tests/decision_behaviour.sql` for the pgTAP patterns
- `specs/001-mvp/contracts/access-matrix.md`

## Respect
- No leave type, note or comment in events. Demo users are synced.
- Use the service_role-only RPCs. Don't add grants to anon or authenticated.
- No new npm dependency. Sign the JWT with WebCrypto.
- No secrets in the repo. Commit only `supabase/functions/.env.example`.

## Don't touch
T017, T166–T168, Cloudflare config (`wrangler.jsonc`, `open-next.config.ts`), the hosted DB.

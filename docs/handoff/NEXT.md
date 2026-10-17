# Handoff → Session 40: Merge calendar sync (PR #226) and switch it on

**Model:** sonnet · **Effort:** low. Mostly git/gh ops and a checklist.

## State
- Branch `feat/calendar-sync`, PR #226. Session 39 fixed 6 of 8 review findings and ran the
  Edge Function locally: 401, 202 + `waitUntil`, create and delete against the test calendar all work.
- Passing: lint, typecheck, 163 unit, 452 pgTAP, `db lint`. Check CI on the pushed commit.

## Goal
1. Sam reviews and merges #226 (human-approved merge).
2. After merge, Sam sets the hosted pieces (do not do these for him):
   - `supabase secrets set` for the four `GOOGLE_*` / `CALENDAR_SYNC_SECRET` values.
   - Vault secrets `calendar_sync_url` and `calendar_sync_secret` on the hosted DB.
3. Smoke test on hosted with one approval, then delete the request.

## Open findings (not fixed, decide or ticket)
- `supabase/functions/calendar-sync/index.ts` has no lint, tsc or CI coverage (Deno entrypoint).
  Option: a `deno check` CI step.
- `.mcp.json` / ADR 0012 / `mcp/README.md` (commit 8537cfa) ride along in #226. Splitting needs a
  rebase of a pushed branch; Sam decides.
- `defer` decrements `attempts`, so a late report from a stale worker can match again. Benign.

## Respect
- Once merged to `main`, schema changes need a new migration.
- Never print or read `supabase/functions/.env`; the repo is public.

## Don't touch
- Hosted secrets and Vault entries: Sam sets those.

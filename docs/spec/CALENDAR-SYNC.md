# Google Calendar sync on approval: build plan

Issue #225 · ADR 0013 · Phase 4. Agreed with Sam on 2026-10-17.

## Why it lives in Postgres
Approvals happen in three places, and all of them call `public.decide_leave_request`: the app
(`src/actions/requests.ts`), the LMS MCP server (`approve_request`) and the demo loader
(`src/server/demo/loader.ts`). If only the app were hooked, MCP and demo approvals would be missed.
Postgres can't sign the RS256 JWT that Google needs, so the DB records the work and an Edge Function
does it.

Other facts that shape the design:
- A decision is final. There's no cancel RPC, and the statuses are pending, approved and declined. A
  declined request never had an event.
- A demo reset deletes the demo auth users, and that cascade-deletes their requests. Deleting an
  approved request must delete its event, or every reset adds duplicates.
- A Worker on the free plan gets 50 subrequests, and a demo reset already uses about 45. The sync
  must not run inside a Worker request.

## Agreed behaviour
- **Target:** one shared team calendar. A Google service account has "Make changes to events" on it.
- **Event:** title `<Full name> — Away`. All-day, from `start_date` to `end_date + 1` (Google's end
  date is exclusive). Transparent, no reminders, no attendees.
  `extendedProperties.private.lmsRequestId`. It never includes the leave type, note or decision
  comment (access matrix row 19).
- **Demo users:** synced too.
- **Decline:** nothing to do. **Approved request deleted:** the event is deleted. **Deactivated
  user:** the event stays, as `team_calendar` does. **Name change:** the title goes stale (accepted).
- **Future `cancel_request`:** its migration must enqueue `delete` for approved → cancelled.

## Design: outbox → pg_cron → Edge Function → Calendar API
Free tier only: pg_cron, pg_net and Vault are on Supabase Free, Edge Functions allow 500k
invocations a month, and the Calendar API is free. No new npm dependency.

1. **Migration `supabase/migrations/<ts>_calendar_sync.sql`**
   - Enable `pg_net` and `pg_cron`.
   - `private.calendar_outbox`: `id bigint identity pk`, `request_id uuid not null` (no FK, so the
     row outlives a deleted request), `action text check in ('create','delete')`,
     `attempts int default 0`, `next_attempt_at timestamptz default now()`, `locked_until`,
     `last_error`, `done_at`, `failed_at`, `created_at`. No grants to anon or authenticated.
   - Trigger `AFTER UPDATE OF status ON leave_requests`: pending → approved enqueues `create`.
   - Trigger `AFTER DELETE ON leave_requests`: if the old status was approved, enqueue `delete`.
   - The approval transaction only inserts a row. A Google outage can never block an approval.
2. **RPCs** in `public`, `security definer`, `search_path = ''`, execute for `service_role` only:
   - `calendar_sync_claim(p_limit int default 20)`: due rows (not done, not failed,
     `next_attempt_at <= now()`, not locked), oldest first, `for update skip locked`. It sets
     `locked_until = now() + 2 min`, increments `attempts`, and returns each row with the current
     `full_name`, `start_date` and `end_date`. These are null if the request is gone.
   - `calendar_sync_finish(p_id bigint, p_outcome text /* done|retry|fail */, p_error text)`.
     The retry backoff is 1m, 5m, 30m, 2h, 12h. After 6 attempts the row is set to `failed_at`.
3. **Kick:** pg_cron runs `private.calendar_sync_kick()` every minute. It reads
   `calendar_sync_url` and `calendar_sync_secret` from Vault. It calls `net.http_post` only when
   both exist and a due row exists. With no secrets the feature is off: CI, fresh DBs and the hosted
   DB stay inert until configured.
4. **Edge Function `supabase/functions/calendar-sync/`**
   - `index.ts` (Deno, thin): checks `Authorization: Bearer $CALENDAR_SYNC_SECRET` with a
     constant-time compare. Uses supabase-js with the auto-injected service role key to call claim
     and finish, and returns counts. `supabase/config.toml` sets
     `[functions.calendar-sync] verify_jwt = false`.
   - `lib.ts` (plain TS, no Deno APIs, unit-tested in vitest):
     - `buildEvent(row)` as above.
     - `eventId(requestId)`: the UUID without dashes. Hex is a subset of Google's base32hex, so the
       ID is deterministic and idempotent.
     - `classify(status)`: 2xx, 409 (create) and 404/410 (delete) → done. 429, 5xx and network
       errors → retry. Other 4xx, for example 403 when the calendar isn't shared → fail.
     - `serviceAccountToken()`: an RS256 JWT signed with WebCrypto, exchanged at
       `https://oauth2.googleapis.com/token` for scope `https://www.googleapis.com/auth/calendar.events`.
   - A `create` whose request is gone counts as done (its `delete` row follows).
5. **Secrets (none in the repo):** the function's env holds `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `GOOGLE_SERVICE_ACCOUNT_KEY` (PEM), `GOOGLE_CALENDAR_ID` and `CALENDAR_SYNC_SECRET`. Locally
   they go in `supabase/functions/.env` (already ignored by `.env.*`); commit
   `supabase/functions/.env.example`. On hosted, use `supabase secrets set`. Vault holds the
   function URL and the same shared secret, set with a documented one-time SQL snippet for each
   environment.

## Files
- New: the migration, `supabase/functions/calendar-sync/{index.ts,lib.ts}`,
  `supabase/functions/.env.example`, `supabase/tests/calendar_sync_*.sql`,
  `tests/unit/calendar-sync.test.ts`
- `supabase/config.toml`: the function block
- `tsconfig.json` / `eslint.config.mjs`: exclude `supabase/functions/**/index.ts` (Deno globals and
  `npm:` specifiers). `lib.ts` is still type-checked through the unit test's import.
- `specs/001-mvp/contracts/access-matrix.md`: row 26 (`calendar_outbox` direct access: ✗ for
  all) and row 27 (`calendar_sync_claim` / `calendar_sync_finish`: ✗ for E/M/A/X/∅, service_role
  only)
- `src/lib/database.types.ts`: `npm run types:gen`
- `.github/workflows/deploy-db.yml`: add `npx supabase functions deploy calendar-sync` after
  `db push`
- A README setup section, `docs/ROADMAP.md`, the journal

**Don't touch:** T017, T166–T168, Cloudflare config, the hosted DB. Sam sets the hosted secrets and
Vault entries after merge.

## Verification
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:test` all pass. The pgTAP tests
   check:
   - approve enqueues `create`, and decline enqueues nothing
   - deleting an approved request enqueues `delete`, and deleting a pending one doesn't
   - anon and authenticated can't touch the outbox or the RPCs (rows 26–27)
   - claim respects due time, the lock and the limit
   - backoff and failing after 6 attempts
   - kick is a no-op without Vault secrets
2. Unit tests: the event shape (exclusive end date, no leave type or note), the eventId format, the
   classify table, and the JWT header and claims (with a generated test key).
3. Locally end to end. Sam provides the service account key and a test calendar shared with the
   service account. Approve with LMS MCP `approve_request`, wait about 1 minute, then check with the
   Google Calendar connector `list_events`. Then run a demo reset and confirm there are no duplicates.

# 0013 Google Calendar sync: Postgres outbox, Edge Function, shared calendar

**Status:** accepted

**Context:** Phase 4 needs approved leave to appear on a Google calendar. Approvals come from the
app, the LMS MCP server and the demo loader, and all of them call `decide_leave_request`. A Worker
on the free plan already comes close to its 50-subrequest limit during a demo reset. Postgres can't
sign the RS256 JWT that a Google service account needs. The budget is $0.

**Decision:**

- **Where:** the DB records the work and an Edge Function does it. Triggers on `leave_requests`
  write to `private.calendar_outbox`: `create` for pending → approved, and `delete` when an approved
  request is deleted (a demo reset cascades these). Every minute, pg_cron calls the
  `calendar-sync` Supabase Edge Function through pg_net, but only when there is due work. The
  function claims rows through RPCs that only `service_role` can execute, and calls the Calendar API.
- **Target and shape:** one shared team calendar. A service account has "Make changes to events" on
  it, so there's no per-user OAuth and no Workspace delegation. The title is `<Full name> — Away`,
  all-day, and never includes the leave type, note or comment. That matches what employees see in
  `team_calendar` (access matrix row 19). Demo users are synced.
- **Idempotency and retry:** the event ID is the request UUID without dashes, which is valid
  base32hex. So a create that returns 409 and a delete that returns 404/410 both count as done.
  429, 5xx and network errors are retried with backoff (1m to 12h, 6 attempts). Other 4xx fail
  straight away, and the outbox row keeps the error.
- **Credentials:** the service account key, calendar ID and a shared kick secret live in Edge
  Function secrets (`supabase/functions/.env` locally, `supabase secrets set` on hosted). The
  function URL and the kick secret live in Vault. If they're missing, the kick does nothing, so a
  database without them is inert.

**Rejected:**

- **Calling Google from the Server Action:** it misses MCP and demo approvals, and it uses up Worker
  subrequests.
- **A Worker cron trigger:** it means changing the Cloudflare config and a custom OpenNext handler.
- **A GitHub Actions cron:** the latency is poor and the schedule is unreliable.
- **Per-user calendars:** they need Workspace domain-wide delegation or stored refresh tokens.

**Consequences:** an event appears up to about 1 minute after approval, and an approval never
waits on Google. A renamed person's past events keep their old name. A future `cancel_request`
must enqueue `delete` for approved → cancelled. Failed rows are only visible in SQL, for example
through the Supabase MCP. Turning sync on for an environment takes three manual steps: the Google
setup, the function secrets and two Vault entries.

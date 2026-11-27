# 0019 Email notifications: the same outbox, one row per recipient

**Status:** accepted

**Context:** #174 needs two things said: an approver learns a request or an ask arrived, and a
requester learns the answer. ADR 0013 already established that a decision reaches `leave_requests`
from four paths — the app's Server Action, `decide_leave_request` through the LMS MCP server,
`decide_cancellation`, and the demo loader — and that the brief's rule is *sending must never block
submit or decide*. A Worker on the free plan is close to its 50-subrequest limit during a demo reset.
Two people's free text is involved, and one of them is not always allowed to read the other's. The
budget is $0 (Constitution I), Brevo is the provider (ADR 0006), and its free tier is 300 emails a day.

**Decision:**

- **Where:** the DB records the work and an Edge Function does it, exactly as ADR 0013 does for the
  calendar. Four triggers — on `leave_requests` and on `cancellation_requests` — write
  `private.email_outbox`. Every minute pg_cron calls the `email-notify` function through pg_net, and
  only when there is due work. The function claims and reports through two RPCs that only
  `service_role` can execute.
- **One row per recipient,** not one row per event: the retry unit has to be a send. A batch of
  approvers where one address is dead must not fail the other four. `unique (event, recipient,
  coalesce(cancellation_id, request_id))` is what makes "one email per person per event" a data
  rule rather than a hope — and two asks on the same leave are two questions, so they are two sends.
- **Who hears what:** `request_submitted` and `cancellation_requested` go to every active manager and
  admin except the person who raised it; `request_approved`, `request_declined`,
  `cancellation_approved` and `cancellation_declined` go to the requester alone. There is no event for
  a withdrawal — the person who withdrew is the one person who already knows, and the other party is
  the approver who no longer has to look. Demo people enqueue nothing: a fiction cannot be approved
  by email, which extends ADR 0013's rule from the calendar to the mailbox.
- **The leak guard is SQL, not manners.** The claim returns one column, `detail`, chosen by a `CASE`
  over the event: the note for a submission, the decision comment for an answer, the reason for an
  ask, the ask's comment for its answer. An approver's comment therefore never travels to a colleague,
  and text a recipient has no right to never enters the function's process at all. The body is plain
  text: a person's words go in verbatim, and with no HTML there is nothing to escape.
- **Read at send time:** the address, both names, the leave type and the dates are joined when the row
  is claimed, not when it was queued. A renamed person is honoured; a person switched off in the
  meantime comes back with no address and is reported `skipped` rather than mailed. `is_active` is then
  the single switch that stops mail to someone, for the queue already waiting and not only for what
  comes after.
- **Retry:** backoff 1m, 5m, 30m, 2h, 12h, and the sixth attempt writes `failed_at` instead of waiting
  again — about fifteen hours of wall clock, since those five waits sum to 14h36m. Six is attempts, not
  minutes: a provider outage lasting an hour costs the employee their notice only if it outlasts the
  day. 429, 5xx and network faults are `retry`; a 401 or 403 is `defer` — one fault shared by every
  row, so it refunds the attempt and waits ten minutes rather than emptying the queue while someone
  notices the key is wrong.
- **Credentials:** five function secrets (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
  `SITE_URL`, `EMAIL_NOTIFY_SECRET`) and two Vault rows (`email_notify_url`, `email_notify_secret`).
  Without the Vault rows the kick returns before it reaches `net.http_post`; without the API key the
  function answers 500 before it claims anything. A database that has neither is inert, which is why
  CI, a fresh stack and production all send nothing until Sam configures them.
- **Inert is not the same as harmless,** so the first claim writes down a date. The triggers start
  queueing the moment this migration applies, and nothing drains until the Vault rows exist. Left
  unconfigured for a fortnight, the queue would then deliver a fortnight of old approvals on one
  minute, which reads as a bug in the feature rather than as a gap in the setup. `private.email_cutover`
  holds that single timestamp: the first claim stamps it and closes every older row as `skipped` with a
  reason, so the backlog is retired in the database instead of mailed late.
- **`verify_jwt = false`** on the function, for the reason ADR 0014 already gives: the caller is
  pg_cron, so there is no user and no user JWT to verify. `EMAIL_NOTIFY_SECRET` is the authentication.

**Rejected:**

- **Sending from the Server Action**, which is what #174's file list suggested. It covers one of the
  four paths that can decide a request, it spends Worker subrequests, and a slow provider would sit in
  front of the submit the person was trying to complete.
- **One outbox row per event with a recipient list.** One bad address then fails a whole message, and
  "one email per person" stops being expressible as a key.
- **A `sent_at` column on `leave_requests`.** A request has many recipients with independent outcomes;
  one timestamp cannot hold that state.
- **Brevo transactional templates** (`templateId` plus `htmlContent`). It puts provider-side ids in
  the repo and makes the provider load-bearing in the code, while buying design work nobody has asked
  for. Plain text keeps ADR 0006's provider swappable.
- **Composing the message at enqueue time.** A note edited after submission would mail the old text,
  and it copies another person's free text into a second table for no benefit.
- **A Worker cron, or a GitHub Actions cron:** both reasons carried over from ADR 0013.

**Consequences:** mail arrives about a minute after the decision, and a decision never waits on the
provider. A request deleted before its send ran — a demo reset cascades them — is skipped, and the row
says why. Failed sends are visible only in SQL, the same as a failed calendar sync — and so is a
backlog that was retired rather than mailed, which is what an environment configured weeks after the
merge sees. Switching an
environment on takes three manual steps: mint the Brevo key, set the function secrets, add the two
Vault rows. Brevo's free 300 a day is the blast radius and, at this team's size, roughly 30
submissions a day if every approver is mailed; if that is exceeded the answer is a paid tier, which is
Sam's call under Constitution I, not a silent change here. A new mailable event now means a trigger, a
`COPY` entry, an arm of the `detail` `CASE`, and a row in the access matrix.

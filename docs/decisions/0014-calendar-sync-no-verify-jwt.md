# 0014 Deploy calendar-sync with --no-verify-jwt

**Status:** accepted · **Decided by:** Sam, 2026-10-18

**Context:** `calendar-sync` is called by pg_cron through pg_net, inside the database. There is no
user, so no user JWT exists to verify. `supabase/config.toml` already sets `verify_jwt = false`,
but the deploy step did not say so.

**Decision:** Pass `--no-verify-jwt` explicitly in `deploy-db.yml`, so the deployed setting
doesn't depend on config.toml being picked up. The function authenticates callers itself:
`supabase/functions/calendar-sync/index.ts` compares the `Authorization: Bearer` value with
`CALENDAR_SYNC_SECRET` in constant time and returns 401 otherwise.

**Evidence the check holds:** the handler returns 401 when the secret env var is unset or empty,
when the header is missing, and when the value is wrong. Nothing runs before that check.

**Consequences:** The platform no longer filters requests, so the shared secret is the only gate.
Anyone holding the secret can trigger a drain (it only processes the outbox). Rotate it by
updating the function secret and the Vault entry together. The flag is redundant with config.toml;
we accept that for explicitness.

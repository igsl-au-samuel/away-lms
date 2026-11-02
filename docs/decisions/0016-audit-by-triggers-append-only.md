# 0016 Audit entries are written by database triggers and are append-only

**Status:** accepted · 2026-11-02 (spec 002; details settled in the plan, `specs/002-transaction-audit/research.md`)

## Context
Away needs a trustworthy record of who changed what (spec 002). Changes reach the data
by three routes: the web app, the MCP server and direct SQL (Studio, migrations,
the demo loader). The record is only useful if no route can skip it, and if nobody,
including the admin, can rewrite it afterwards.

## Decision
- **Triggers, not app code.** Audit entries are written by database triggers inside the
  same transaction as the change, so a change and its entry succeed or fail together.
  Writing entries from the app or from RPC bodies was rejected: it covers only the
  routes that remember to call it, and the MCP server and direct SQL would be gaps.
- **Actor from the session.** The actor is `auth.uid()`, which works inside security
  definer functions and triggers because it reads the request's JWT setting. With no
  signed-in person (secret key, Studio, migrations) the actor is "System". The MCP server
  already acts as the signed-in user, so its changes carry the real actor. An allowance
  reason, which has no column, reaches the trigger through a transaction-local setting set
  by `admin_set_allowance`.
- **Append-only.** No role gets update, delete or truncate on the audit table, `service_role`
  included, and all writes come only from trigger functions (security definer, execute
  revoked from every role). Clients cannot insert either. This follows the grants-below-RLS
  rule in [0009](0009-grants-below-rls.md). A `BEFORE UPDATE/DELETE/TRUNCATE` trigger
  that raises `audit_immutable` also stops the secret key and direct SQL.
- **No cascade.** Entries hold ids without foreign keys, plus a name and role snapshot,
  so deleting a user or request never deletes history. Cascade deletes from demo removal
  write no events.
- **One home.** The old `allowance_changes` log folds into the audit table by an
  idempotent backfill, then is dropped in a later migration once the counts match.
- **Visibility in the database.** One select policy: admin all; others their own entries
  and default-allowance changes; managers also request and allowance entries for people
  they can decide for ([0010](0010-decision-rules-and-check-order.md) rule).

## Consequences
- Every audited table pays a small write cost per change. Fine at this team size.
- A superuser or the table owner can still drop the immutability trigger. Append-only here
  means no role can alter rows without a visible schema change. The pgTAP tests prove every
  role (employee, manager, admin, inactive, anon, service_role) is refused.
- Rows never leave, so size only grows. Revisit archiving if free-tier limits near.
- Migrations that rewrite audited tables need care so they don't create false entries.
- Reads and the CSV export are security-invoker SQL functions, so the policy is the single
  place visibility is decided. The CSV is built in SQL to fit the Workers Free CPU limit.

# Research: Transaction audit log

Phase 0 for [plan.md](plan.md). No NEEDS CLARIFICATION remain. Each entry is
Decision, Rationale, Alternatives. R1–R10 settle the five points listed in
`docs/handoff/NEXT-002.md`.

## R1 How a trigger learns the actor

**Decision:** `private.audit_actor()` reads `auth.uid()`. If it is null, the actor is
"System" (id null, role null, name `System`). Otherwise the actor role and name are looked
up in `profiles` inside the trigger. A uid with no profile gets the name `Unknown user`.

**Rationale:** `auth.uid()` reads the request's JWT claims setting, not the database
role. It is therefore unchanged inside `security definer` RPCs and trigger functions, which
is how `admin_set_allowance` already logs `changed_by` today. Every user-facing route
carries the user's JWT: the web app, and the MCP server (`src/server/mcp/session.ts`
rejects privileged keys, so it always acts as the signed-in user). Calls with the secret
key (service role), Studio, migrations and `psql` carry no `sub`, so they record as System.
The demo loader's `profiles` insert uses the secret key, so each demo "user created" entry
is System and demo-marked. Its `submit_leave_request` and `decide_leave_request` calls use
real user sessions and record real actors.

**Alternatives:**
- Pass the actor as a parameter to every RPC: the app could forget it or lie, and direct
  SQL has no way to supply one. Rejected.
- Read `current_user` / `session_user`: that is the database role (`authenticator`,
  `postgres`), never the person. Rejected.
- Separate "System (service)" from "System (database)": no spec need (YAGNI).

## R2 Where the comment (reason) comes from

**Decision:** The trigger reads the comment from the row when one exists
(`leave_requests.decision_comment`). Allowances have no reason column, so
`admin_set_allowance` calls `set_config('away.audit_reason', coalesce(p_reason, ''), true)`
(transaction-local, set on every call) just before it writes. The allowance trigger reads it
with `current_setting('away.audit_reason', true)` and stores `nullif(…, '')`. The RPC's own
`allowance_changes` insert goes away.

**Rationale:** the old log held a `reason`, and FR-014 says nothing may be lost. Always
setting the value (even to empty) stops a stale reason leaking into a later call in the
same transaction. A client cannot set arbitrary settings through PostgREST, and a direct
SQL user already controls the comment text anyway. The actor still comes only from R1.

**Alternatives:** add a `reason` column to `allowance_overrides` (stores audit text in a
business table, and it would be overwritten); write the entry from the RPC (breaks ADR 0017).

## R3 Which trigger writes which event

**Decision:** AFTER ROW triggers on four tables, each with a `when` clause so a no-op save
writes nothing (spec edge case).

| Table | Fires on | Entries |
|-------|----------|---------|
| `leave_requests` | insert | `request_submitted` |
| `leave_requests` | update of `status` when old = `pending` and new differs | `request_approved` or `request_declined` |
| `allowance_overrides` | insert, update of `days` | `allowance_set` |
| `allowance_overrides` | delete, only while the owner's profile still exists | `allowance_removed` |
| `profiles` | insert | `user_created` |
| `profiles` | update of `role`, `region_code`, `is_active` | one entry per changed field: `user_role_changed`, `user_region_changed`, `user_active_changed` |
| `leave_types` | update of `default_allowance` or `is_capped` | `leave_type_default_changed` |
| `leave_types` | update of `name`, `is_active`, `sort_order` | `leave_type_changed` |

One save that touches several concerns writes several entries, which together hold every
before/after value ("several fields at once"). A single save that edits both the default
allowance and the name writes two entries. Splitting by concern gives each entry exactly
one visibility rule (FR-020 vs FR-021), which a single mixed entry could not have.

`allowance_set` takes `old` from the prior override, or from the type default when there
was none, matching the old log. `allowance_removed` records `after.days = null` and
`context.default_days`, so the screen can say "default now applies".

**Cascade deletes write nothing.** Removing a demo user cascades to their overrides. The
`allowance_removed` trigger skips when `not exists (select 1 from public.profiles where
id = old.user_id)`; in an AFTER ROW trigger fired by a cascade the parent is already gone.
Requests are only audited on insert and status change, so request cascades are silent.
This was confirmed with Sam (demo cascades are not events; ADR 0004).

**Alternatives:** one trigger per RPC (the MCP server and SQL would still be covered, but
direct table edits by `service_role` would not); a single mixed entry per save (visibility
problem above); `statement` triggers with transition tables (more code, no benefit here).

## R4 Shape of the table

**Decision:** one table, `public.audit_log`, in `public` so PostgREST can read it under RLS.
Columns are in [data-model.md](data-model.md). Key choices:

- No foreign keys at all. Ids are plain uuids plus name and role snapshots, so deleting a
  user, request or leave type never cascades into the log (FR-012, FR-013).
- `action` and `entity` are `text` with `check (… in (…))`, not enums. Adding a value
  later (cancel/withdraw events in 001's backlog) is a constraint swap, avoiding
  `alter type … add value` limits inside migrations.
- `before` / `after` / `context` are `jsonb`. `before` and `after` hold only changed
  fields. `context` holds identifying labels at the time (leave type name, year, request
  dates) so an entry stays readable after a rename.
- `created_at` is `now()`, the same value as `decided_at` for a decision. Order is
  `(created_at desc, id desc)`; `id` is an identity column, so ties are stable (spec
  "Clock and order").
- `is_demo` is copied from the subject at write time (falls back to the actor).
  It is not recomputed, so a reset that deletes the demo user does not unmark entries.

**Secrets:** the trigger functions build `before`/`after` from an explicit field list per
table, never `to_jsonb(row)`. `profiles.email` is excluded; no auth column is read (FR-007).

**Alternatives:** per-entity audit tables (four tables, four sets of policies and tests, and
no single "newest first" list); `to_jsonb(old)` snapshots (leaks every column, including
future ones).

## R5 Making it append-only

**Decision:**
1. RLS is on. `revoke all` from `anon`, `authenticated` and `service_role`, then
   `grant select` to `authenticated`. This includes TRUNCATE (ADR 0009).
2. No insert/update/delete policies.
3. All writing goes through `private.audit_write(...)`, called only by `private` trigger
   functions. These are `security definer`, `search_path = ''`, with execute revoked from
   `public, anon, authenticated, service_role`.
4. Defence in depth: a `BEFORE UPDATE OR DELETE` row trigger and a `BEFORE TRUNCATE`
   statement trigger raise `P0001 audit_immutable`. Measured in #354, they answer only a
   session that owns the table (superuser, `postgres`, a migration): `service_role` is
   refused earlier, by the `revoke all` of R1, because Postgres checks privileges before it
   fires a trigger. Only dropping the trigger (a schema change, visible in
   migrations and review) bypasses it. This is stronger than ADR 0017's baseline, where
   even the owner could alter rows.

**Rationale:** grants stop every API role, the secret key included, with `42501`; the trigger is
what stops direct SQL from a session that owns the table, which FR-005 names ("by any route"). The immutability trigger does not
affect `insert … on conflict do nothing` (backfill) since no row is updated.

**Test consequence:** `supabase db reset` and rolled-back pgTAP transactions still work.
Tests that must clear audit rows between cases use rollback, not delete.

**Alternatives:** grants only (leaves service_role and SQL able to edit); a separate schema
with a different owner (more moving parts than a $0 team demo needs); hash chaining for
tamper evidence (out of scope, noted below).

## R6 Visibility enforced in the database

**Decision:** one `select` policy on `audit_log`, using
`private.can_view_audit(actor_id, subject_id, entity, action)` (`security definer`, `stable`,
`search_path = ''`, returns false for a null role):

- admin: true
- everyone else with a role: `actor_id = auth.uid()` or `subject_id = auth.uid()` or
  `action = 'leave_type_default_changed'`
- manager, additionally: `entity in ('leave_request','allowance')` and the subject
  currently has role `employee` or `admin` and is not the manager

The manager rule is ADR 0010's who-may-decide rule applied to the subject's current role.
`allowance` entries are included for managers because the Approvals page shows them for
queue requesters (decided with Sam; this amends FR-020). Inactive and anonymous callers
get no rows. All reads, counts, filters and exports run as the user, so FR-022 holds with
no extra code.

**Performance:** per-row function calls could be slow at 50,000 rows. The policy keeps the
cheap `actor_id`/`subject_id` tests first and the helper only evaluates the subject's role for
managers. T-tasks include a 50k-row timing test (SC-008). If it fails, the fallback is a
policy written as an inline `exists (select 1 from public.profiles …)` with the role read
once in an initPlan `(select private.current_role())`.

**Alternatives:** a security definer list RPC that filters in the function (a second
place to get the rule wrong, and a bypass of RLS); JWT role claims (roles come from the
table, ADR 0007).

## R7 Idempotent backfill

**Decision:** `private.audit_backfill()` inserts with
`on conflict (source_key) where source_key is not null do nothing` — the predicate is repeated
because uniqueness comes from a partial index, not a constraint, and Postgres will not infer a
bare `on conflict (source_key)` against one (`42P10`).
`source_key` is a nullable unique text column, null for live entries (Postgres allows many
nulls) and set for backfilled ones:

- `req:<request id>:submitted` (time `created_at`, actor and subject = requester)
- `req:<request id>:decided` (time `decided_at`, actor `decided_by`, comment
  `decision_comment`, before status `pending`)
- `ac:<allowance_changes.id>` (old/new days, `changed_by`, `changed_at`, `reason`;
  `user_id` null becomes `leave_type_default_changed`)

All rows get `is_backfilled = true`. Names and actor roles are the current ones (the only
data held). The migration calls the function once. The function stays so tests can call it
twice and count rows (SC-006). Backfill inserts bypass the row triggers' event logic
because it writes to `audit_log` directly, and it never touches business tables, so it
cannot create live entries.

Not reconstructed: users created and role/region/status changes (no source, FR-019).

**Alternatives:** a one-shot `insert … select` in the migration (cannot be re-run or
tested twice); matching on content columns to avoid duplicates (fragile).

## R8 Retiring `allowance_changes` safely

**Decision:** two migrations in two PRs.

1. **Migration A** (with the app change): create `audit_log`, triggers and policy; run the
   backfill; replace `admin_set_allowance` (drop its log insert, add the R2 setting); drop
   trigger `leave_types_log_default` and `private.log_leave_type_default()`. The old table
   is left in place, frozen. The same PR switches the three readers from `allowance_changes`
   to `audit_log`: `src/app/(app)/page.tsx`, `src/app/(app)/approvals/page.tsx`,
   `src/app/(app)/admin/users/[id]/page.tsx`.
2. **Migration B** (next PR, after a production row-count check that every
   `allowance_changes` row has an `ac:` entry): drop the table, its policies and grants.
   Update `supabase/tests/row23_*`, `row24_*`, `leave_type_default_log.sql`,
   `tests/integration/demo-reset.test.ts`, access-matrix rows 23–24 and D4, and regenerate
   `src/lib/database.types.ts`.

**Rationale:** dropping in the same migration as the backfill would make a bad backfill
unrecoverable. The old default-change trigger skipped changes with no caller; the new one
logs them as System, which is an improvement, not a regression.

## R9 Manager query and "My history"

**Decision:** `public.audit_my_history(p_before_at timestamptz, p_before_id bigint,
p_limit int default 50)` is `security invoker`, so the R6 policy applies. It returns entries where the
caller is actor or subject, plus `leave_type_default_changed`, plus (managers only) the
`leave_request` and `allowance` entries they can decide. For an admin it is own entries plus
default changes only (the Audit page is their wide view). Keyset paging on `(created_at, id)`
keeps the cost flat as the log grows. The Approvals panel reads `audit_log` directly for
`action in ('allowance_set','allowance_removed')` and `subject_id in (queue requesters)`,
which the policy already allows for the caller.

## R10 CSV export path

**Decision:** two security-invoker SQL functions and a thin route handler.

- `public.audit_search(p_person uuid, p_action text, p_entity text, p_role app_role,
  p_demo boolean, p_from timestamptz, p_to timestamptz, p_before_at timestamptz,
  p_before_id bigint, p_limit int)` returns `setof audit_log`. It is the single filter
  used by the Audit page (admin) and the export. Non-admins get no rows through RLS and
  `not_allowed` from the function's own check.
- `public.audit_export_csv(<same filters>, p_tz text, p_limit int default 10000)` returns
  `{ csv text, row_count int, truncated boolean }`. It builds the file in SQL, formats times
  in `p_tz`, renders `before`/`after` as `field: old → new`, and neutralises formula
  injection (prefix `'` when a cell starts with `=`, `+`, `-`, `@`, tab or CR).
- `GET /admin/audit/export` (route handler) calls the function with the admin's session and
  returns the text as `text/csv` with `Content-Disposition`. The `truncated` flag is
  returned in an `X-Audit-Truncated` header and shown by the page next to the button.

**Rationale:** Workers Free allows 10 ms CPU and about 50 subrequests (ADR 0005, 0013), and
PostgREST returns at most 1000 rows per call. Building 10,000 rows in the Worker would
need ten calls plus CSV string work in JavaScript. One SQL call is one subrequest and
almost no CPU. Postgres `string_agg` over 10,000 short rows is well under the 30 s target
(SC-008), to be confirmed by the 50k-row test.

**Alternatives:** stream pages through the Worker (CPU and subrequest risk); a Supabase Edge
Function (a new moving part; free but unneeded); client-side CSV in the browser (the
browser would need all rows, and the neutralising logic would sit outside the database).

## R11 Other decisions

- **Timestamps in the UI** use the viewer's timezone (001 FR-026) through the existing
  formatting helpers; the database stores `timestamptz`.
- **No channel field** (web/MCP/SQL). The actor identity is the spec requirement; a channel
  would need app cooperation and is not in FR-001.
- **Tamper evidence** (hash chain, external anchor) is out of scope. ADR 0017 already
  records that table-owner access exists; revisit if the audit ever has legal weight.
- **Retention:** forever. 5–15 users and a few thousand entries a year is far below the
  Supabase Free 500 MB database limit. Revisit only if size nears it.
- **Migration discipline:** any later migration that rewrites `profiles`, `leave_requests`,
  `allowance_overrides` or `leave_types` can fire the triggers and write false entries. Use
  `set session_replication_role = replica` only in a documented backfill-style migration,
  or add a note in the PR. Called out in `quickstart.md`.

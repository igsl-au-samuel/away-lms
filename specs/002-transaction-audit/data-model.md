# Data model: Transaction audit log

Phase 1 output for [plan.md](plan.md). Postgres (Supabase). Tables are in `public`, helper
and trigger functions in `private`. Decisions behind each choice are in
[research.md](research.md). Conventions follow
[001's data model](../001-mvp/data-model.md).

## Table `audit_log`

One immutable row per fact. **No foreign keys, by design**: ids are plain uuids, and name
and role snapshots keep rows readable after people, requests or leave types are deleted
(FR-012, FR-013).

| Column | Type | Rules |
|--------|------|-------|
| `id` | `bigint` identity PK | Tie-break for ordering |
| `created_at` | `timestamptz` not null | default `now()`. Original time for backfilled rows |
| `actor_id` | `uuid` null | Null = System |
| `actor_role` | `app_role` null | Role held at that moment. Null for System |
| `actor_name` | `text` not null | Snapshot. `System` when no signed-in person. `Unknown user` if a uid had no profile |
| `action` | `text` not null | One of the actions below (check) |
| `entity` | `text` not null | `leave_request`, `allowance`, `user`, `leave_type` (check) |
| `entity_id` | `uuid` null | Request, profile or leave type id. Null for allowances (their key is in `context`) |
| `subject_id` | `uuid` null | Person the entry is about. Null for default and leave-type changes |
| `subject_name` | `text` null | Snapshot. Null when `subject_id` is null |
| `before` | `jsonb` null | Changed fields only, old values |
| `after` | `jsonb` null | Changed fields only, new values |
| `context` | `jsonb` null | Labels at the time: `leave_type_id`, `leave_type_name`, `year`, `start_date`, `end_date`, `working_days`, `default_days` |
| `comment` | `text` null | Decision comment or allowance reason, up to 500 chars |
| `is_demo` | `boolean` not null | default `false`. Subject's demo flag at write time |
| `is_backfilled` | `boolean` not null | default `false` |
| `source_key` | `text` null unique | Backfill idempotency key. Null for live entries |

Checks: `char_length(comment) <= 500`. `before`/`after` never hold secrets: each trigger
builds them from a fixed field list, never `to_jsonb(row)` (FR-007).

Indexes:
- `(created_at desc, id desc)` — default list and keyset paging
- `(subject_id, created_at desc, id desc)` — My history, person filter
- `(actor_id, created_at desc, id desc)` — person filter
- `(action, created_at desc)` — action filter
- unique `(source_key)` where not null — backfill

RLS is on. See [contracts/access-matrix.md](contracts/access-matrix.md).

### Actions

| `action` | `entity` | Subject | `before` → `after` |
|----------|----------|---------|--------------------|
| `request_submitted` | `leave_request` | requester | none → `{status:'pending'}`; `context` has dates, type, working days |
| `request_approved` | `leave_request` | requester | `{status:'pending'}` → `{status:'approved'}` |
| `request_declined` | `leave_request` | requester | `{status:'pending'}` → `{status:'declined'}` |
| `allowance_set` | `allowance` | the user | `{days: old}` → `{days: new}`. Old = prior override, else type default |
| `allowance_removed` | `allowance` | the user | `{days: old}` → `{days: null}`; `context.default_days` shows what applies now |
| `user_created` | `user` | the new user | none → `{role, region_code, is_active}` |
| `user_role_changed` | `user` | the user | `{role}` → `{role}` |
| `user_region_changed` | `user` | the user | `{region_code}` → `{region_code}` |
| `user_active_changed` | `user` | the user | `{is_active}` → `{is_active}` |
| `leave_type_default_changed` | `leave_type` | none (everyone) | `{default_allowance, is_capped}` changed fields |
| `leave_type_changed` | `leave_type` | none | `{name, is_active, sort_order}` changed fields |

Decision comments come from `leave_requests.decision_comment`. Allowance reasons come
from the transaction-local setting `away.audit_reason` (research R2).

## Functions (all in `private` unless noted)

| Function | Purpose |
|----------|---------|
| `audit_actor()` | Returns `(id, role, name)` from `auth.uid()` and `profiles`, or System |
| `audit_write(...)` | The only insert into `audit_log`. Fills actor, snapshots and `is_demo` |
| `audit_requests()` | Trigger fn on `leave_requests` (insert, status update) |
| `audit_allowances()` | Trigger fn on `allowance_overrides` (insert, update, delete) |
| `audit_profiles()` | Trigger fn on `profiles` (insert, update of role/region/active) |
| `audit_leave_types()` | Trigger fn on `leave_types` (update; splits default vs other) |
| `audit_immutable()` | Raises `audit_immutable` on update, delete, truncate |
| `can_view_audit(actor uuid, subject uuid, entity text, action text)` | The visibility rule used by the policy |
| `audit_backfill()` | Idempotent backfill from `leave_requests` and `allowance_changes` |
| `public.audit_search(...)`, `public.audit_my_history(...)`, `public.audit_export_csv(...)` | Read functions, security invoker. See [contracts/database-api.md](contracts/database-api.md) |

All `private` functions are `security definer`, `search_path = ''`, with execute revoked
from `public, anon, authenticated, service_role`, except `can_view_audit`, which
`authenticated` needs for the policy.

## Triggers

| Table | Trigger | When | Function |
|-------|---------|------|----------|
| `leave_requests` | `audit_insert` | after insert | `audit_requests` |
| `leave_requests` | `audit_decision` | after update of `status`, `when old.status = 'pending' and new.status <> old.status` | `audit_requests` |
| `allowance_overrides` | `audit_change` | after insert or update of `days` or delete | `audit_allowances` |
| `profiles` | `audit_insert` | after insert | `audit_profiles` |
| `profiles` | `audit_change` | after update of `role, region_code, is_active`, `when` any of the three is distinct | `audit_profiles` |
| `leave_types` | `audit_change` | after update, `when` any audited column is distinct | `audit_leave_types` |
| `audit_log` | `audit_no_update_delete` | before update or delete, per row | `audit_immutable` |
| `audit_log` | `audit_no_truncate` | before truncate, per statement | `audit_immutable` |

Notes:
- The old `leave_types_log_default` trigger is dropped in migration A (research R8).
- `allowance_overrides` delete skips when the owner's profile no longer exists.
- Trigger order does not matter: each writes independent rows.

## Retired: `allowance_changes`

Content moves into `audit_log` (`ac:<id>` backfill keys). Migration A freezes the table (no
writers). Migration B drops it, with its policies, grants and the `allowance_changes_changed_by_fkey`
joins in the three screens that used it. Mapping:

| Old column | New place |
|------------|-----------|
| `user_id` | `subject_id` (null → `leave_type_default_changed`) |
| `leave_type_id` | `context.leave_type_id`, `context.leave_type_name` |
| `year` | `context.year` |
| `old_days`, `new_days` | `before.days`, `after.days` (default changes: `default_allowance`) |
| `changed_by` | `actor_id`, `actor_name`, `actor_role` |
| `changed_at` | `created_at` |
| `reason` | `comment` |

## Relationships

```text
profiles, leave_requests, allowance_overrides, leave_types
        │  (triggers write, in the same transaction)
        ▼
   audit_log   ← no foreign keys; reads only through RLS
```

## State and invariants

- A row is written once and never changes. There is no state machine.
- A business change and its audit rows commit or roll back together (FR-004).
- A rejected change leaves no row, since triggers fire only on real changes.
- Rows survive deletion of everything they refer to.

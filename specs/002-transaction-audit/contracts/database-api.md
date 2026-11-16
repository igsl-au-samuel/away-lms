# Contract: database API additions

Continues [001's database API](../../001-mvp/contracts/database-api.md). Same conventions:
errors are `raise exception using errcode = 'P0001', message = '<code>', detail = '…'`,
`execute` is granted to `authenticated` only (`revoke all … from public, anon` by name,
ADR 0009), and dates are ISO strings.

The three read functions here are **`security invoker`**, so row-level security on
`audit_log` applies to every row they return. They never widen what a caller can see
(FR-022). This differs from 001's `security definer` rule on purpose: the rule is
enforced by the table's policy, not by the function.

## Reads

### `audit_my_history(p_before_at timestamptz default null, p_before_id bigint default null, p_limit int default 50)` → setof `audit_log`
Newest first, keyset paging: pass the last row's `created_at` and `id` as the cursor.
`p_limit` is capped at 100. Returns entries where the caller is the actor or subject, plus
`leave_type_default_changed`, plus, for managers only, the `leave_request` and `allowance`
entries for people they can decide for (employee and admin, not other managers, not
themselves). For an admin it is their own entries plus default changes. Inactive callers get
no rows. FR-020, FR-023.

### `audit_search(p_person uuid default null, p_action text default null, p_entity text default null, p_role app_role default null, p_demo boolean default null, p_from timestamptz default null, p_to timestamptz default null, p_before_at timestamptz default null, p_before_id bigint default null, p_limit int default 50)` → setof `audit_log`
The Audit page query. Admin only; anyone else gets `not_allowed`. Filters combine with AND:
- `p_person` matches actor or subject
- `p_role` matches `actor_role`
- `p_demo` true = demo only, false = real only, null = both (the page sends false by default)
- `p_from` inclusive, `p_to` exclusive
Newest first, keyset paging as above, `p_limit` capped at 100. FR-024.

### `audit_export_csv(<the audit_search filters, without paging>, p_tz text, p_limit int default 10000)` → `{ csv text, row_count int, truncated boolean }`
Admin only (`not_allowed` otherwise). Applies the same filters through the same shared
predicate as `audit_search`, so screen and file match. `p_tz` must be a valid IANA name,
otherwise `invalid_timezone`. `p_limit` is capped at 10,000; when more rows match,
`truncated` is true and the file holds the newest `p_limit` rows. FR-025, FR-026.

CSV columns, in order: `time`, `actor`, `actor_role`, `action`, `entity`, `subject`,
`before`, `after`, `comment`, `demo`, `backfilled`, `entry_id`. `time` is
`YYYY-MM-DD HH24:MI:SS` in `p_tz`. `before` and `after` are `field: value; field: value`.
Every text cell is quoted and has quotes doubled. A cell that begins with `=`, `+`, `-`,
`@`, tab or carriage return is prefixed with `'`.

## Changed existing functions

### `admin_set_allowance(...)` (behaviour change only; signature unchanged)
Still checks `private.is_admin()`, validates the type, and writes the override. It no
longer inserts into `allowance_changes`. Before writing it calls
`set_config('away.audit_reason', coalesce(p_reason, ''), true)`; the audit trigger on
`allowance_overrides` records the entry, using the reason as the comment. Errors are
unchanged. The override change and its audit entry are one transaction.

### `submit_leave_request`, `decide_leave_request`, `admin_create_profile`, `admin_update_user`, `admin_set_active`
No change. Their writes fire the audit triggers. Their error codes and ordering (ADR 0010)
are untouched, and a rejected call writes nothing.

## New error codes

| Code | Raised by | Meaning |
|------|-----------|---------|
| `audit_immutable` | trigger on `audit_log` | An update, delete or truncate of audit entries was attempted |
| `not_allowed` | `audit_search`, `audit_export_csv` | Caller is not an active admin |
| `invalid_timezone` | `audit_export_csv` | `p_tz` is not an IANA timezone name |

## Not exposed

`private.audit_write`, `private.audit_backfill`, `private.audit_actor`, the trigger
functions and `private.can_view_audit`'s callers other than the policy are not callable
through the API: execute is revoked from `public, anon, authenticated, service_role`
(`can_view_audit` keeps `authenticated` for the policy only). There is no insert, update or
delete route to `audit_log` for any role.

## App surface (summary; routes and components are for the tasks phase)

| Route | Who | Uses |
|-------|-----|------|
| `/history` ("My history") | every signed-in active user | `audit_my_history` |
| `/admin/audit` | admin | `audit_search`; filters in the URL query so views are shareable |
| `GET /admin/audit/export` | admin | `audit_export_csv`; returns `text/csv` with `Content-Disposition: attachment` and `X-Audit-Truncated` |
| Home, Approvals, Admin user page (allowance history) | as today | `audit_log` filtered to `allowance_set`/`allowance_removed` and `leave_type_default_changed`, replacing `allowance_changes` |

Employees and managers who open `/admin/audit` or the export route are refused by the
function (`not_allowed`), and the route returns 403; the nav link is hidden for them as a
convenience only. Server Actions and route handlers use the user's session, never the secret
key, for every audit read.

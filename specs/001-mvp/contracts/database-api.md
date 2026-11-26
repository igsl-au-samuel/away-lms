# Contract: database API (PostgREST RPC + table access)

The app's only data interface. The browser and server use the Supabase client with
the user's session. Only the admin and demo Server Actions also use the secret key,
and then only for `auth.admin.*` calls and demo rows (see
[app-surface.md](app-surface.md)).

**Conventions**
- Every function below is `security definer`, `set search_path = ''`, and executable
  by `authenticated` only, unless marked *anon*. Each one starts by resolving the
  caller with `private.current_role()`. A null role (no profile, or inactive) raises
  `not_allowed`.
- Errors: `raise exception using errcode = 'P0001', message = '<code>', detail =
  '<plain English>'`. The UI maps `<code>` to copy. Unknown codes show a generic
  error.
- Dates are ISO `YYYY-MM-DD` strings in and out.

## Identity

### `health() → boolean` *(anon)*
Returns `true`. Used by the keep-alive workflow (research R11). Touches no tables.

### `whoami() → { id, full_name, email, role, region_code, timezone, is_active, is_demo } | null`
Returns the caller's profile, or null if they have none or are inactive. The app
layout uses it for navigation. Admin Server Actions use it as a pre-check.

## Requests

### `preview_leave_request(p_leave_type_id uuid, p_start date, p_end date)`
→ `{ working_days numeric, available_before numeric|null, over_balance_days numeric|null, errors text[] }`

Uses the same validation as submit, but reports problems instead of raising them.
`errors` can contain: `invalid_range`, `spans_years`, `no_working_days`, `overlap`,
`type_inactive`. `available_before` is null for uncapped types. FR-012, FR-013,
FR-014.

### `submit_leave_request(p_leave_type_id uuid, p_start date, p_end date, p_note text default null)` → `leave_requests` row
- Allowed: any active user, for themselves (employee, manager and admin; FR-011 and
  the admin edge case).
- Computes `working_days` with `private.count_working_days(<caller region>, …)`,
  copies `region_code`, and sets `over_balance_days`.
- Raises `invalid_range` | `spans_years` | `no_working_days` | `overlap` (also
  enforced by the exclusion constraint) | `type_inactive` | `note_too_long`.

### `decide_leave_request(p_request_id uuid, p_outcome request_status, p_comment text default null)` → `leave_requests` row
- `p_outcome` must be `approved` or `declined`, otherwise `invalid_outcome`.
- May decide (FR-017–FR-019):
  - manager, when the requester is an employee or an admin
  - admin, when the requester is an employee or a manager
  - never the requester themselves
- Sets `status`, `decided_by = auth.uid()`, `decided_at = now()` and
  `decision_comment`, with `UPDATE … WHERE id = p_request_id AND status = 'pending'`.
- Raises `not_found` | `not_allowed` | `own_request` | `already_decided`.

### `approval_queue()` → setof `{ id, user_id, requester_name, requester_is_demo, leave_type_id, leave_type_name, is_capped, start_date, end_date, working_days, note, over_balance_days, available_now, created_at }`
The pending requests the caller may decide (the same rule as above), oldest first.
Employees get `not_allowed`. `available_now` is the requester's current available
balance for that type and year (null if uncapped). FR-021.

### `team_calendar(p_from date, p_to date)` → setof `{ request_id, user_id, full_name, region_code, is_demo, is_active, start_date, end_date, status, leave_type_name }`
- Any active user. Returns pending and approved requests that overlap
  `[p_from, p_to]`. The range is at most 62 days, otherwise `invalid_range`.
- `leave_type_name` is null unless the caller is the requester, a manager or an
  admin. Notes and comments are never returned. FR-024, FR-024a.
- Includes deactivated users' leave, with `is_active = false` (US6-2).
- Holidays and the people list are read directly (below).

### Table reads used by the UI
- `leave_requests`: own rows; or all rows for a manager or admin (US2-7, FR-016).
- `profiles`: every active user can read every profile (the calendar shows people
  with no leave). Selected columns: `id, full_name, role, region_code, is_active,
  is_demo`. Email is shown only on admin screens.

## Balances and allowances

### `get_balances(p_user_id uuid, p_year smallint)` → setof `{ leave_type_id, name, is_capped, allowance, taken, pending, available }`
- Allowed: yourself, a manager or an admin. Otherwise `not_allowed`.
- Includes active types, plus retired types that have requests that year. Uncapped
  types return `allowance` and `available` as null. FR-010, US1-3.

### `admin_set_allowance(p_user_id uuid, p_leave_type_id uuid, p_year smallint, p_days numeric, p_reason text default null)` → `allowance_overrides` row or null
- Admin only. `p_days = null` removes the override. Capped types only
  (`type_uncapped`). Raises `not_allowed`.
- Upserts the override and appends to `allowance_changes` (old value, new value,
  caller, `now()`, reason) in one transaction. FR-008, FR-008a.

### Table reads
- `allowance_overrides`: own rows; or all for a manager or admin.
- `allowance_changes`: rows where `user_id = auth.uid()` or `user_id is null`; all for
  a manager or admin. FR-008a.

## Reports (issue #180, spec backlog 8)

### `leave_report(p_year smallint)` → setof `{ person_id, person_name, leave_type_id, leave_type_name, is_capped, allowance, taken, pending, available, is_demo }`
- Manager or admin only, by `private.is_approver()`; an employee or an inactive user
  gets `not_allowed` (FR-005, matrix row 43). Ordered by person, then leave type.
- One call for the whole matrix, deliberately: a Worker on the free plan gets 50
  subrequests and `get_balances` is one call per person, so a report built from it
  could not render a team at all (#448 has the measured demo load).
- The arithmetic is `get_balances`' arithmetic, shared through `private.report_rows`,
  so the report cannot disagree with the balances panel: `taken` sums approved
  `working_days`, `pending` sums pending ones, `available` comes from
  `private.available_balance`, and a retired type appears when it holds a counted
  request in `p_year`. Uncapped types return `allowance` and `available` as null.
  FR-010.
- Carries no `note`, no `decision_comment`, no dates and nothing that names a
  specific absence. A utilisation file gets emailed; "Ada used three days" is a
  different product from "Ada was away in March".

### `leave_report_csv(p_year smallint)` → `{ csv text, row_count int }` (always one row)
- Same gate, same rows, same order; the file is rendered in SQL from the same helper,
  which is what makes "the download matches the screen" a property of one query rather
  than a hope about two.
- Header `person,leave_type,allowance_days,taken_days,pending_days,available_days,demo`,
  LF line endings, every cell quoted and formula-neutralised the way
  `audit_export_csv` does it. An uncapped type's allowance and available are empty
  cells, not the word "null" — a spreadsheet reads the second as a zero, and a zero
  allowance is a claim about a budget nobody set.
- No row cap, unlike the audit export: this result set is people × leave types, which
  the roster bounds. A cap here could only ever hide rows.

## Admin: people

### `admin_create_profile(p_user_id uuid, p_full_name text, p_email text, p_role app_role, p_region_code text, p_timezone text default null)` → `profiles` row
Admin only. Called right after a successful `auth.admin.inviteUserByEmail`.
`p_user_id` must exist in `auth.users` and have no profile yet
(`profile_exists`).

### `admin_update_user(p_user_id uuid, p_full_name text, p_role app_role, p_region_code text)` → `profiles` row
Admin only. An admin can't change their own role (`cannot_change_own_role`). A demo
user can't stop being an employee (`demo_must_be_employee`).

### `admin_set_active(p_user_id uuid, p_active boolean)` → `profiles` row
Admin only, and never on yourself (`cannot_deactivate_self`). The Server Action then
bans or unbans the auth user. FR-004, FR-027.

### `admin_set_demo_active(p_active boolean)` → `uuid[]`
Admin only. Sets `is_active` on every demo profile and returns their ids, which the
Server Action uses for the bans. FR-031.

## Admin: reference data (direct table writes, RLS)

| Table | Admin | Everyone else |
|-------|-------|---------------|
| `leave_types` | insert, update (no delete) | select |
| `holiday_regions` | insert, update | select |
| `public_holidays` | insert, update, delete | select |

## Private (not exposed)

- `private.current_role() → app_role | null`, `private.is_admin()`,
  `private.is_approver()`
- `private.count_working_days(p_region text, p_start date, p_end date) → numeric`
- `private.validate_request(…)`, shared by preview and submit
- `private.available_balance(p_user uuid, p_type uuid, p_year smallint) → numeric | null`
- `private.report_rows(p_year smallint) → setof`, the utilisation matrix both report
  paths call. `security invoker` and revoked from every API role, so it answers nobody
  directly — the definer on the two public functions is the only way in.

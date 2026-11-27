# Data model: Away MVP

Phase 1 output for [plan.md](plan.md). It's Postgres (Supabase), schema `public`
unless noted. RLS is enabled on every table (see
[contracts/access-matrix.md](contracts/access-matrix.md)). Days are `numeric(5,1)`
(research R9). Dates are `date`, and instants are `timestamptz`.

## Enums

| Type | Values |
|------|--------|
| `app_role` | `employee`, `manager`, `admin` |
| `request_status` | `pending`, `approved`, `declined`, `withdrawn`, `cancelled` |

`request_status` has three values in FR-015 and five in the schema: `withdrawn` and `cancelled`
arrived with backlog 3 (issue #175). Nothing orders by the enum — no query sorts or compares the
column positionally — so the two values could simply be appended, and the check on
`cancellation_requests.status` is what keeps them out of a column that only ever holds an
approver's yes or no.

## Tables

### `holiday_regions`
Reference data, shared by everyone.

| Column | Type | Rules |
|--------|------|-------|
| `code` | `text` PK | `^[A-Z]{2,5}$`. Seeded with `QLD`, `NSW`, `HK` |
| `name` | `text` not null | e.g. "Queensland (Brisbane)" |
| `default_timezone` | `text` not null | Valid IANA name (in `pg_timezone_names`) |
| `created_at` | `timestamptz` | default `now()` |

FR-022, FR-028 (the admin can add a region). Regions are never deleted once a profile
or request uses them (FK `restrict`).

### `public_holidays`

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `region_code` | `text` FK → `holiday_regions.code` | not null, `on delete restrict` |
| `holiday_date` | `date` not null | |
| `name` | `text` not null | 1–80 chars |

Unique `(region_code, holiday_date)`. FR-022, FR-028. Editing or removing a holiday
never changes stored request counts (edge case).

### `profiles`
One row per person, 1:1 with `auth.users`.

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` PK | FK → `auth.users.id` `on delete cascade` |
| `full_name` | `text` not null | 1–100 chars |
| `email` | `text` not null unique | Copy of the auth email, lower-cased |
| `role` | `app_role` not null | default `employee` |
| `region_code` | `text` FK → `holiday_regions` | not null |
| `timezone` | `text` not null | Valid IANA name (trigger check). Defaults to the region's timezone |
| `is_active` | `boolean` not null | default `true` |
| `is_demo` | `boolean` not null | default `false` |
| `created_at` | `timestamptz` | default `now()` |

Checks: `not is_demo or role = 'employee'` (FR-032).
Writes: the user updates their own `region_code` and `timezone` only (column grant).
Everything else goes through admin RPCs. FR-002, FR-004, FR-023, FR-027.

### `leave_types`
Reference data, shared by everyone.

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` not null unique | 1–50 chars |
| `is_capped` | `boolean` not null | |
| `default_allowance` | `numeric(5,1)` null | `≥ 0`. Required if capped, null if uncapped |
| `is_active` | `boolean` not null | default `true`. False = retired |
| `sort_order` | `smallint` not null | default `0` |

Check: `is_capped = (default_allowance is not null)`. There's no delete: a type is
retired (`is_active = false`), and existing requests keep it (edge case). Seeded with
Annual leave (20), Personal/Sick leave (10) and Unpaid leave (uncapped). An `after
update` trigger writes an `allowance_changes` row with `user_id = null` when
`default_allowance` changes (research R12). FR-007.

### `allowance_overrides`
A per-user, per-year entitlement that replaces the default.

| Column | Type | Rules |
|--------|------|-------|
| `user_id` | `uuid` FK → `profiles` | `on delete cascade` |
| `leave_type_id` | `uuid` FK → `leave_types` | Capped types only (checked in RPC) |
| `year` | `smallint` | 2000–2100 |
| `days` | `numeric(5,1)` not null | `≥ 0` |

PK `(user_id, leave_type_id, year)`. The only writer is `admin_set_allowance`, which
also logs the change. FR-008.

### `allowance_changes`
An append-only log. No client gets update or delete.

| Column | Type | Rules |
|--------|------|-------|
| `id` | `bigint` identity PK | |
| `user_id` | `uuid` FK → `profiles` null | Null = a change to a type default (everyone) |
| `leave_type_id` | `uuid` FK → `leave_types` | not null |
| `year` | `smallint` null | Null for default changes |
| `old_days` | `numeric(5,1)` null | Null = there was no override before |
| `new_days` | `numeric(5,1)` null | Null = override removed (back to default) |
| `changed_by` | `uuid` FK → `profiles` | not null |
| `changed_at` | `timestamptz` | default `now()` |
| `reason` | `text` null | up to 500 chars |

FR-008a. `on delete cascade` from `user_id`, so demo resets clean up their own rows.

### `leave_requests`

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles` | `on delete cascade` (only demo users are ever deleted) |
| `leave_type_id` | `uuid` FK → `leave_types` | Must be active when submitted |
| `start_date` | `date` not null | |
| `end_date` | `date` not null | Inclusive |
| `region_code` | `text` FK → `holiday_regions` | The requester's region at submission |
| `working_days` | `numeric(5,1)` not null | `> 0`. Computed by the server, fixed |
| `over_balance_days` | `numeric(5,1)` null | `> 0` when over balance at submission. Null for uncapped types |
| `note` | `text` null | up to 500 chars |
| `status` | `request_status` not null | default `pending` |
| `decided_by` | `uuid` FK → `profiles` null | |
| `decided_at` | `timestamptz` null | |
| `decision_comment` | `text` null | up to 500 chars |
| `created_at` | `timestamptz` | default `now()` |

Constraints:
- `end_date >= start_date` (FR-013)
- `extract(year from start_date) = extract(year from end_date)` (FR-009, FR-013)
- `leave_requests_decision_shape_check`: `case status when 'pending' then decided_by is null
  and decided_at is null when 'withdrawn' then decided_by is null else decided_by is not null
  or decided_at is not null end`. This replaced the plain
  `(status = 'pending') = (decided_by is null and decided_at is null)` for #175, because a
  withdrawn row has no approver to name and an `and` in the last arm would have tightened the
  rule on every status at once.
- `decided_by <> user_id` (FR-019, a backstop for the RPC check)
- Exclusion (`btree_gist`): `user_id with =`, `daterange(start_date, end_date, '[]')
  with &&`, `where status in ('pending','approved')` (FR-013 overlap, race-safe). Untouched by
  #175, and that is the point: `withdrawn` and `cancelled` are terminal and release the slot,
  while an unanswered cancellation ask leaves the leave `approved` and therefore still reserved.

There's no demo column: a request is demo when its requester is (ADR 0004).

### `cancellation_requests`

The ask behind a cancellation (backlog 3, issue #175). One row per question: the requester opens
it against their own approved leave, an approver answers it. The leave is never the thing that
carries the question, which is why this feature needed a table rather than a sixth status — a
`cancel_requested` value on the request would have meant editing every filter that reads
`status in ('pending','approved')`, the exclusion constraint's `ARRAY[...]`, and the balance sums,
to teach them that a request in that state is still exactly as approved as it was.

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` PK | |
| `request_id` | `uuid` FK → `leave_requests` | not null, `on delete cascade` |
| `requested_by` | `uuid` FK → `profiles` | not null, `on delete cascade`. Always the leave's `user_id`, enforced by the RPC; stored rather than joined so the row is self-describing to the audit trigger and to the check below |
| `requested_at` | `timestamptz` not null | default `now()` |
| `reason` | `text` null | up to 500 chars. Empty arrives as null |
| `status` | `request_status` not null | default `pending`, and only `pending`, `approved`, `declined` |
| `decided_by` | `uuid` FK → `profiles` null | `on delete set null` |
| `decided_at` | `timestamptz` null | |
| `decision_comment` | `text` null | up to 500 chars |

Constraints:
- `status in ('pending', 'approved', 'declined')` — this column holds an approver's answer, not a
  request's fate.
- `(status = 'pending') = (decided_by is null and decided_at is null)` — the rule
  `leave_requests` had to relax for `withdrawn`, and this table does not need relaxed.
- `decided_by <> requested_by` — FR-019 again, kept as data so a privileged write cannot
  manufacture an approver out of the asker.
- `cancellation_requests_one_open`: unique on `request_id` where `status = 'pending'`. One open
  ask per leave; a decided one stays, so a leave asked about twice has two rows and can be asked
  about a third time.

RLS is enabled, no API role may write, and there is **no select policy yet** — the same
deliberate absence access-matrix row 45 records, which the UI half of #175 replaces with a row
of its own.

## Derived values (functions, not stored)

- **Allowance** for (user, type, year) = `allowance_overrides.days`, or else
  `leave_types.default_allowance`. Uncapped types have no allowance.
- **Taken** = the sum of `working_days` of approved requests in that year.
  **Pending** = the same for pending requests. **Available** = allowance − taken −
  pending. It may be negative, and the UI marks that (FR-010, FR-014).
- **Over balance at submission** = `max(0, working_days − available_before)` for
  capped types. It's stored as `over_balance_days` when greater than 0. The queue
  also shows the current available balance (FR-021).

## State transitions: `leave_requests.status`

```text
            submit_leave_request
   (none) ───────────────────────▶ pending
                                     │ decide_leave_request(approve) ──▶ approved
                                     ├ decide_leave_request(decline) ──▶ declined (final)
                                     └ withdraw_leave_request ─────────▶ withdrawn (final)

   approved ── decide_cancellation(approve) ────────────────────────────▶ cancelled (final)
       │
       └─ request_cancellation ─▶ (an ask in cancellation_requests; the status does not move)
```

Three functions change status, each from exactly one state. `decide_leave_request` and
`withdraw_leave_request` both act on `pending` — one is the approver's answer, the other is the
requester closing their own question — and `decide_cancellation` is the only thing that can move
an `approved` request, and only after the requester asked. A second decision on the same request
gets `already_decided` (FR-015, edge case); a second ask on a leave that has already been
cancelled gets `not_cancellable`, and a second ask while one is open gets `already_requested`.
Approved and declined stay final in the sense FR-015 meant: nothing rewrites an approver's
decision, and a cancelled leave keeps the `decided_by` of whoever approved it.

## Relationships

```text
auth.users 1─1 profiles ─┬─< leave_requests >── leave_types
                         ├─< allowance_overrides >── leave_types
                         └─< allowance_changes
                         └─< cancellation_requests >── leave_requests (many asks per request, one open)
holiday_regions 1─< public_holidays
holiday_regions 1─< profiles, leave_requests (region at submit)
```

## Seed (migration `…_seed_reference.sql`, idempotent)

Regions QLD, NSW and HK with their timezones. The three default leave types. Public
holidays for 2026 and 2027 from official lists (ADR 0008). No people: real users come
from invites, and demo users from the demo loader.

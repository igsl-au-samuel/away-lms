# Contract: access matrix additions (policy test checklist)

Continues [001's access matrix](../../001-mvp/contracts/access-matrix.md). Every row is
one pgTAP section with **at least one allowed and one refused case** (Constitution III,
FR-030, SC-005). Roles: **E** employee (demo employees are E), **M** manager, **A** admin,
**X** inactive user of any role, **∅** anon, **S** `service_role` (secret key / SQL).
✓ allowed, ✗ refused. "own" = actor or subject is the caller.

**Supersedes** 001 rows 23 and 24 (`allowance_changes` select and direct write), which
migration B — research R8, `20261118020000_drop_allowance_changes.sql` — has now done: the
table is gone, and 001 strikes those two rows to point here. Row 23's manager visibility
("all") is deliberately narrowed to rows 30–31 below.

| # | Resource / action | E | M | A | X | ∅ | S | Spec |
|---|-------------------|---|---|---|---|---|---|------|
| 28 | `audit_log` select, entry where caller is actor or subject | own ✓ | own ✓ | all ✓ | ✗ | ✗ | n/a | FR-020 |
| 29 | `audit_log` select, another person's entry (not a default change) | ✗ | ✗ | ✓ | ✗ | ✗ | n/a | FR-020, FR-022 |
| 30 | `audit_log` select, `request_*` entry for a request the caller can decide (requester E or A, not self) | ✗ | ✓ | ✓ | ✗ | ✗ | n/a | FR-020 |
| 31 | `audit_log` select, `allowance_*` entry for a person the caller can decide for | ✗ | ✓ | ✓ | ✗ | ✗ | n/a | FR-020 (amended) |
| 32 | `audit_log` select, request or allowance entry for another manager, or the manager's own as non-subject | ✗ | ✗ | ✓ | ✗ | ✗ | n/a | FR-020 |
| 33 | `audit_log` select, `leave_type_default_changed` | ✓ | ✓ | ✓ | ✗ | ✗ | n/a | FR-020 |
| 34 | `audit_log` select, `leave_type_changed` (name, active, sort order) | ✗ | ✗ | ✓ | ✗ | ✗ | n/a | FR-021 |
| 35 | `audit_log` select, `user_*` entry about another person | ✗ | ✗ | ✓ | ✗ | ✗ | n/a | FR-020 |
| 36 | `audit_log` insert directly | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | FR-006 |
| 37 | `audit_log` update directly | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | FR-005 |
| 38 | `audit_log` delete directly | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | FR-005 |
| 39 | `audit_log` truncate | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | FR-005, ADR 0009 |
| 40 | `private.audit_write`, `private.audit_backfill` and the trigger functions, called directly | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | FR-006 |
| 41 | `audit_search`, `audit_export_csv` | ✗ (`not_allowed`) | ✗ | ✓ | ✗ | ✗ (`42501`) | n/a | FR-024, FR-025, FR-027 |
| 42 | `audit_my_history` | own ✓ | own + decidable ✓ | own ✓ | ✗ | ✗ (`42501`) | n/a | FR-023 |

Rows 36–39 are asserted with the exact error: `42501` where a grant is missing
(E, M, A, X, ∅ and S — Postgres checks grants before it fires a trigger, so the secret key
never reaches one), and `audit_immutable` where the trigger answers (a superuser or other
session that owns the table). Rows 28–35 each need a seeded entry of that kind, made by a real event, so the
test also proves the trigger wrote it.

## Event-by-route cases (behaviour, same suite)

For each event in FR-002, one test per route that can make it (FR-031, SC-001). A route
that cannot make the event is marked "n/a".

| Event | RPC / app route | MCP (user JWT) | Direct SQL | Secret key |
|-------|-----------------|----------------|------------|------------|
| `request_submitted` | `submit_leave_request` | same RPC | insert | n/a (no direct client write) |
| `request_approved` / `request_declined` | `decide_leave_request` | same RPC | update | n/a |
| `allowance_set` / `allowance_removed` | `admin_set_allowance` | n/a (no tool) | insert/delete | System actor |
| `user_created` | `admin_create_profile` | n/a | insert | System actor (demo loader) |
| `user_role_changed` / `user_region_changed` / `user_active_changed` | `admin_update_user`, `admin_set_active`, own region update | n/a | update | System actor |
| `leave_type_default_changed` / `leave_type_changed` | admin edit of `leave_types` | n/a | update | System actor |

Each case asserts exactly one entry (or one per changed field), the right actor and role,
the name snapshots, and the before/after values. Direct SQL and secret-key cases assert
actor `System`.

## Behaviour tests in the same suite (not access)

- Rejected change (`already_decided`, `not_allowed`, constraint violation) leaves no entry
  (US1-8, FR-004).
- No-op save (same role, same region, same default) leaves no entry.
- One save changing role and region writes two entries.
- A save changing default allowance and name writes one `leave_type_default_changed` and
  one `leave_type_changed`.
- Demo removal cascading overrides writes no `allowance_removed` entry; the removed user's
  existing entries remain and show their name.
- Deleting a user, request or leave type leaves its entries untouched (FR-012).
- `audit_backfill()` twice gives the same row count; original times, people and comments
  are kept; rows are marked backfilled (SC-006).
- A reason passed to `admin_set_allowance` appears as the entry comment, and an empty
  reason after a non-empty one in the same transaction does not inherit it (research R2).
- CSV: a comment starting `=1+1`, `+x`, `-x`, `@x` or a tab comes out prefixed with `'`;
  times are in the requested timezone; the file has exactly the filtered rows; more than
  `p_limit` rows sets `truncated`.
- 50,000-row timing: `audit_my_history` and a filtered `audit_search` page under 2 s;
  a 10,000-row export under 30 s (SC-008).
- No secret in an entry: `profiles` update that touches `email` writes nothing and no entry
  contains an `email` key.

## Demo-specific cases

| # | Case | Expected | Spec |
|---|------|----------|------|
| D6 | Demo load | Entries are written and marked `is_demo`; `user_created` actor is System | FR-010, ADR 0004 |
| D7 | Demo reset and remove (integration, not pgTAP) | Every real `audit_log` row is byte-identical before and after, and no demo entry is deleted | FR-032, SC-007 |
| D8 | Demo employee reads `audit_log` | Sees only own entries and default changes (an employee's view), never a real colleague's | ADR 0004 |
| D9 | Audit page default filter | Hides demo entries; the filter can show them | FR-024 |

D4 in 001 (reset leaves `allowance_changes` byte-identical) became D7 above when migration B
dropped the table: the same promise, about `audit_log`. How the test reads it is worth
recording, because both halves are load-bearing: it goes through an admin session, since
`20261116062027_audit_log.sql` revokes everything on the log from `service_role`, and it scopes
the read to one real subject rather than "every real entry", because the shared test database
runs other files alongside this one and an unscoped count would move for reasons the demo did
not cause.

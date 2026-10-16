# Contract: access matrix (policy test checklist)

Every row is one pgTAP test file section, with **at least one allowed and one refused
case** (Constitution III, SC-005). Roles: **E** employee (demo employees are E),
**M** manager, **A** admin, **X** inactive user of any role, **∅** anon.
✓ = allowed, ✗ = refused, "own" = only rows about the caller.

| # | Resource / action | E | M | A | X | ∅ | Spec |
|---|-------------------|---|---|---|---|---|------|
| 1 | `profiles` select | ✓ | ✓ | ✓ | ✗ | ✗ | FR-024 |
| 2 | `profiles` update `region_code`, `timezone` | own | own | own | ✗ | ✗ | FR-023 |
| 3 | `profiles` update `role`, `is_active`, `is_demo`, `email` directly | ✗ | ✗ | ✗ | ✗ | ✗ | FR-005 |
| 4 | `admin_create_profile` / `admin_update_user` / `admin_set_active` | ✗ | ✗ | ✓ (not self for role/active) | ✗ | ✗ | FR-027, US6-5 |
| 5 | `admin_set_demo_active` | ✗ | ✗ | ✓ | ✗ | ✗ | FR-031 |
| 6 | `leave_types` select | ✓ | ✓ | ✓ | ✗ | ✗ | FR-007 |
| 7 | `leave_types` insert/update | ✗ | ✗ | ✓ | ✗ | ✗ | FR-007, US6-5 |
| 8 | `holiday_regions` / `public_holidays` select | ✓ | ✓ | ✓ | ✗ | ✗ | FR-022 |
| 9 | `holiday_regions` / `public_holidays` write | ✗ | ✗ | ✓ | ✗ | ✗ | FR-028, US6-5 |
| 10 | `leave_requests` select | own | all | all | ✗ | ✗ | FR-016, FR-024a |
| 11 | `leave_requests` insert/update/delete directly | ✗ | ✗ | ✗ | ✗ | ✗ | FR-005 |
| 12 | `submit_leave_request` | own | own | own | ✗ | ✗ | FR-011 |
| 13 | `decide_leave_request`: requester E | ✗ | ✓ | ✓ | ✗ | ✗ | FR-017, FR-018 |
| 14 | `decide_leave_request`: requester M | ✗ | own ✗ | ✓ | ✗ | ✗ | FR-018, FR-019 |
| 15 | `decide_leave_request`: requester A | ✗ | ✓ | own ✗ | ✗ | ✗ | FR-017, FR-019 |
| 16 | `decide_leave_request` on a decided request | ✗ | ✗ | ✗ | ✗ | ✗ | FR-015 |
| 17 | `approval_queue` | ✗ | ✓ (E and A requests) | ✓ (E and M requests) | ✗ | ✗ | FR-021, US3-3 |
| 18 | `team_calendar` rows | ✓ | ✓ | ✓ | ✗ | ✗ | FR-024 |
| 19 | `team_calendar` `leave_type_name` for others | ✗ (null) | ✓ | ✓ | ✗ | ✗ | FR-024a |
| 20 | `get_balances` for another user | ✗ | ✓ | ✓ | ✗ | ✗ | FR-021 |
| 21 | `allowance_overrides` select | own | all | all | ✗ | ✗ | FR-008 |
| 22 | `admin_set_allowance` | ✗ | ✗ | ✓ | ✗ | ✗ | FR-008, US6-5 |
| 23 | `allowance_changes` select | own + defaults | all | all | ✗ | ✗ | FR-008a |
| 24 | `allowance_changes` insert/update/delete directly | ✗ | ✗ | ✗ | ✗ | ✗ | FR-008a |
| 25 | `health()` | ✓ | ✓ | ✓ | ✓ | ✓ | R11 |

## Demo-specific cases

| # | Case | Expected | Spec |
|---|------|----------|------|
| D1 | Make a demo profile a manager or admin (direct or RPC) | refused (check + `demo_must_be_employee`) | FR-032 |
| D2 | A demo employee reads a real colleague's request through `leave_requests` | no rows | FR-024a, ADR 0004 |
| D3 | A demo employee calls `team_calendar` | real and demo rows, `leave_type_name` null for others | ADR 0004 |
| D4 | Demo reset (integration test, not pgTAP) | every real `profiles`, `leave_requests`, `allowance_overrides` and `allowance_changes` row is byte-identical before and after | FR-030, SC-007 |
| D5 | Demo disable (integration) | every demo user is banned and `is_active = false`, and no real user changes | FR-031 |

## Behaviour tests in the same suite (not access)

Working-day counts for the US2-1 and US2-2 QLD-versus-NSW week, an HK holiday,
weekend-only (`no_working_days`), year-spanning (`spans_years`), overlap (including
two concurrent submits), and a stored count unchanged after a holiday edit or region
change. Balance arithmetic for US1-3, plus negative available after an allowance
cut. SC-004.

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
| 23 | ~~`allowance_changes` select~~ | n/a | n/a | n/a | n/a | n/a | FR-008a — **superseded** by [002 rows 28–31](../../002-transaction-audit/contracts/access-matrix.md) |
| 24 | ~~`allowance_changes` insert/update/delete directly~~ | n/a | n/a | n/a | n/a | n/a | FR-008a — **superseded** by [002 rows 36–38 and 40](../../002-transaction-audit/contracts/access-matrix.md) |
| 25 | `health()` | ✓ | ✓ | ✓ | ✓ | ✓ | R11 |
| 26 | `private.calendar_outbox` direct access | ✗ | ✗ | ✗ | ✗ | ✗ | ADR 0013 |
| 27 | `calendar_sync_claim` / `calendar_sync_finish` | ✗ | ✗ | ✗ | ✗ | ✗ (service_role only) | ADR 0013 |
| 43 | `leave_report` / `leave_report_csv` | ✗ | ✓ | ✓ | ✗ | ✗ | Backlog 8 (issue #180) — gate FR-005/FR-021, arithmetic FR-010 |
| 44 | `withdraw_leave_request` | own ✓ | own ✓ | own ✓ | ✗ | ✗ (`42501`) | Backlog 3 (issue #175) — FR-015's pending, closed by its requester |
| 45 | `request_cancellation` | own ✓ (approved leave) | own ✓ | own ✓ | ✗ | ✗ (`42501`) | Backlog 3 (issue #175) |
| 46 | `decide_cancellation` | ✗ | own ✗, E and A ✓ | own ✗, E and M ✓ | ✗ | ✗ (`42501`) | Backlog 3 (issue #175), same rule as rows 13–16 |
| 47 | `private.email_outbox`, `private.email_cutover`, its four enqueue triggers and the kick | ✗ | ✗ | ✗ | ✗ | ✗ | ADR 0019 (issue #174) — the row 26 rule for the second queue |
| 48 | `email_notify_claim` / `email_notify_finish` | ✗ | ✗ | ✗ | ✗ | ✗ (service_role only) | ADR 0019 — the row 27 rule, and the only way mail is sent |
| 49 | who a send is queued to | colleague ✗, own answer ✓ | approver ✓, own request ✗ | approver ✓, own request ✗ | ✗ | ✗ | ADR 0019 — FR-017's audience and FR-024a's rule, in a mailbox |

Rows 23 and 24 are struck because `allowance_changes` no longer exists: migration B,
`20261118020000_drop_allowance_changes.sql`, dropped it after A045 confirmed production held
no row that had not already been carried into `audit_log`. Nothing about the guarantee was
lost, only its home. Who may *see* an allowance change is now 002 rows 28–31, who may *write*
one is 002 rows 36–38 and 40, and the change itself is an `allowance_changed` entry there. The
two pgTAP files that asserted these rows — `row23_allowance_changes_select.sql` and
`row24_allowance_changes_no_direct_write.sql` — were deleted in the same branch, so this
table describes only rows the suite still runs. `n/a` means "there is no such resource to
reach", not "untested".

Row 43 is numbered after [002's rows 28–42](../../002-transaction-audit/contracts/access-matrix.md),
not after the 27 above it, because the two files share one sequence of row numbers and 43 is the
next free one — a row belongs in the matrix of the spec that asked for it, and its number belongs
to the sequence. `specs/001-mvp/tasks.md:21` is what ties the number to a file: one pgTAP file per
row, so the test for this row is `supabase/tests/row43_leave_report.sql`. (Issue #180 suggested
`row26_leave_report.sql`; 26 is `calendar_sync_claim`, taken since ADR 0013.) The row covers both
public functions and, in its last assertion, the private helper underneath them:
`private.report_rows(smallint)` is revoked from `anon`, `authenticated`, `service_role` and
`public`, and `has_function_privilege` proves no API role can call it — which is what makes the
definer on the public pair the only way into another person's totals.

Rows 44–46 continue that sequence, and they are where FR-015's three statuses become five —
`withdrawn` and `cancelled` join `pending`, `approved` and `declined`, which is recorded in
[spec.md's clarifications](../spec.md) rather than by rewriting the requirement.

Row 44 is the only write in this table whose actor is not an approver. The `withdrawn` arm of
`leave_requests_decision_shape_check` is what lets a request close without a decider being
invented for it, and `row44_withdraw_leave_request.sql` proves the arm from data rather than
from the RPC: `decided_by` on a withdrawn request cannot be set at all, while an approved row
still passes with only `decided_at` filled. That second assertion is the proof that this
migration relaxed a rule instead of tightening one.

Rows 45 and 46 split what an approver used to own outright. `request_cancellation` writes a row
*beside* the leave — the leave stays approved, reserved and booked until somebody answers — and
`decide_cancellation` is the only thing that can move it again. Both hold the who-may-decide rule
of rows 13–16 and FR-019. `row46_decide_cancellation.sql` has an admin answer a manager's ask and
is refused answering their own, so the matrix is proved in both directions and not only in the
direction it refuses.

Row 45 also records an absence: `cancellation_requests` has RLS enabled and no select policy, so
`row45_request_cancellation.sql` ends by showing that an authenticated caller cannot insert an
ask directly (`42501`) and cannot read one either (zero rows). That is the state until the
approvals page lists the asks, which is the UI half of #175 and will be its own row.

Rows 47–49 are #174's email queue, and 47–48 deliberately repeat 26–27 rather than describe them:
a second outbox needs its own proof, and the suite should say so. `row47_48_email_notify_access.sql`
is one file for the two rows, the way `row26_27_calendar_sync_access.sql` is, because they are one
decision — who may touch the queue. Its last assertion is the sweep row 40 introduced, matched on the
`email` prefix instead of a list of names, so a fifth writer that forgets its `revoke` is caught the
day it exists. Row 49 is the audience, tested in `row49_email_outbox_recipients.sql` as a rule
compared against the same predicate the trigger uses rather than as a count: this suite has no seed
file, so "three approvers were mailed" would be a fact about whoever ran the migration last. Each
absence there is followed by a line that proves the row really did the thing that could have produced
a send — the request reached `withdrawn`, the leave really turned `cancelled`, the excluded person
really is a switched-off manager — because an assertion about a missing row passes just as happily
when nothing ever happened. The second table inside row 47, `private.email_cutover`, is why the queue
has a date as well as rows: the first claim stamps the day the sender actually ran and closes every
older row as `skipped`, so an environment configured weeks after the merge starts from that week
instead of mailing it as a burst. The claim is the only thing that reads or writes it, which is why
`service_role` is refused it like any other private table.

What those three rows do *not* include is a role that can read the queue. That is the point of 47: an
approver who is the audience of every `request_submitted` row cannot see who is waiting, cancel a
send, or ring the function that empties the list. The message itself is covered by
[ADR 0019](../../../docs/decisions/0019-email-notifications-ride-the-outbox.md), and the claim's `detail`
column is the half that keeps one person's comment out of another person's mailbox.

## Demo-specific cases

| # | Case | Expected | Spec |
|---|------|----------|------|
| D1 | Make a demo profile a manager or admin (direct or RPC) | refused (check + `demo_must_be_employee`) | FR-032 |
| D2 | A demo employee reads a real colleague's request through `leave_requests` | no rows | FR-024a, ADR 0004 |
| D3 | A demo employee calls `team_calendar` | real and demo rows, `leave_type_name` null for others | ADR 0004 |
| D4 | Demo reset (integration test, not pgTAP) | every real `profiles`, `leave_requests` and `allowance_overrides` row is byte-identical before and after. `allowance_changes` left this line with the table; its half of the case is [002's D7](../../002-transaction-audit/contracts/access-matrix.md), which holds the same promise about `audit_log` | FR-030, SC-007 |
| D5 | Demo disable (integration) | every demo user is banned and `is_active = false`, and no real user changes | FR-031 |

## Behaviour tests in the same suite (not access)

Working-day counts for the US2-1 and US2-2 QLD-versus-NSW week, an HK holiday,
weekend-only (`no_working_days`), year-spanning (`spans_years`), overlap (including
two concurrent submits), and a stored count unchanged after a holiday edit or region
change. Balance arithmetic for US1-3, plus negative available after an allowance
cut. SC-004.

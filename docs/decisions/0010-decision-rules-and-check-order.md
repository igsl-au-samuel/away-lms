# 0010 Who may decide a request, and in what order the checks run

**Status:** accepted

**Context:** FR-018 says an admin may decide "any pending request except their own",
but database-api.md and access-matrix rows 13–15 say an admin decides employees and
managers, and a manager decides employees and admins. With more than one admin or
manager the two readings differ. The spec also does not say which error wins when
several apply (e.g. your own, already decided request).

**Decision:** Follow the contract. `decide_leave_request` checks, in order:
`not_allowed` (employee, inactive, no profile) → `invalid_outcome` → `not_found` →
`own_request` → `not_allowed` (manager deciding a manager, admin deciding an admin) →
`already_decided` (the `update … where status = 'pending'` finds no row).
`approval_queue()` applies the same who-may-decide rule. Tests pin all of this
(row13–row17, `decision_behaviour.sql`).

**Consequences:** Employees learn nothing about request ids (they get `not_allowed`
before `not_found`). A second admin cannot decide the first admin's request, and a
second manager cannot decide a manager's; this is a deliberate narrowing of FR-018's
wording. If the team grows past one admin, revisit by changing both RPCs and the
row14/row15 tests together.

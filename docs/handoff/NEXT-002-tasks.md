# Handoff: tasks for feature 002 (transaction audit)
(Separate from NEXT.md, the demo wrap-up brief. Don't overwrite that.)

**Goal:** after Sam has reviewed the plan, run /speckit-tasks for 002, then (separate step) /speckit-taskstoissues.
**Done when:** `specs/002-transaction-audit/tasks.md` exists, ordered by the four delivery slices in plan.md, each task with exact file paths and its pgTAP/test task beside it. No migrations written yet.

**Open first:** `specs/002-transaction-audit/plan.md` (slices, open items), then research.md R1–R10.
**Also read:** data-model.md, contracts/access-matrix.md (rows 28–42, D6–D9), contracts/database-api.md.
**Decide in tasks:** whether slices 1 and 2 are one PR (diff size); where "My history" sits in the nav (docs/design/DIRECTION.md).
**Respect:** audit only, no balance maths; demo per ADR 0004; budget $0; public repo (fictional 50k-row seed); `allowance_changes` is dropped only in a later PR (R8).
**Don't touch:** schema, RLS or migrations. Don't overwrite NEXT.md.
**Model:** sonnet · high.

# Handoff: plan feature 002 (transaction audit)
(Separate from NEXT.md, which is the demo wrap-up brief. Don't overwrite that.)

**Goal:** after Sam approves the spec, run /speckit-plan for 002, in plan mode.
**Done when:** plan.md, data-model.md, contracts (access-matrix rows, database API) and research exist and Sam has reviewed them. No migrations yet.

**Open:** `specs/002-transaction-audit/spec.md` (read first), its Assumptions (two flagged defaults).
**Also read:** docs/decisions/0016, 0004, 0007, 0009, 0010; specs/001-mvp/contracts/access-matrix.md and data-model.md (allowance_changes).
**Must settle in the plan:** how a trigger learns the actor (auth.uid, security definer, service role, "System"); backfill idempotency; retiring allowance_changes; manager visibility query; CSV export path.
**Respect:** audit only, no balance maths; demo per ADR 0004 (not 0003); budget $0; public repo.
**Don't touch:** schema, RLS or migrations before the plan is approved.
**Model:** opus · high.

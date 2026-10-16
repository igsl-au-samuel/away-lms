# Handoff → Session 03: Brainstorm & spec (Spec Kit)

**Model:** opus · **Effort:** high · **Plan mode** · Judgment-heavy product work.

## Goal
Settle what Away's MVP is and record it in Spec Kit, with Sam deciding as we go.
No app code.

## Steps
1. Interview Sam briefly: the problem, users (employee/manager/admin), and MVP vs
   backlog. Use the Phase 3 list in `docs/ROADMAP.md` as the starting point.
2. `/speckit-constitution`: project principles. Include the $0 budget, public repo
   (no secrets), RLS-first security, and the design direction in `docs/design/DIRECTION.md`.
3. `/speckit-specify` for the MVP, then `/speckit-clarify` to resolve open questions.
4. Reconcile the docs: decide whether `docs/spec/PRODUCT.md` is still needed or the
   roadmap should point at `specs/NNN-*/spec.md`. Update the Phase 1 lines in ROADMAP.

## Files to open
`docs/ROADMAP.md` · `docs/design/DIRECTION.md` · `docs/decisions/0001-spec-kit-for-spec-driven-flow.md` · `.specify/memory/constitution.md`

## Decisions to respect
- ADR 0001: Spec Kit is the spec flow (Superpowers is not installed). Scripts are `sh`.
- Stack in CLAUDE.md is tentative. Confirm it via ADR in the plan step, not in this session.
- GitHub: `igsl-au-samuel/away-lms` · commits as `samuel.tse@igsl-group.com`.

## Don't
- Don't run `/speckit-plan`, `/speckit-tasks` or `/speckit-implement` yet (next sessions).
- No Next.js app, CI, labels, issues, Vercel or Supabase linking.

## Done when
The constitution and MVP `spec.md` are written and clarified, ROADMAP Phase 1 is
updated, and everything is committed on a `docs/…` branch and pushed
→ `session-journal` → `next-step`.

# 0001 Use GitHub Spec Kit for the spec-driven flow

**Status:** accepted · 2026-10-16

## Context
Phase 1 needs a structured brainstorm → spec → plan → tasks flow. Two options were
on the table: the Superpowers plugin's brainstorm-and-plan skills, or GitHub Spec
Kit. Using both would duplicate the flow and cost tokens, so we pick one.

## Decision
Use GitHub Spec Kit (`specify-cli` 0.12.11, installed with uv), set up with
`specify init --here --integration claude --script sh`. Superpowers is not installed.

## Consequences
- The demo audience will recognise it: each feature gets `spec.md`, `plan.md` and
  `tasks.md`, created with `/speckit-specify`, `/speckit-plan` and `/speckit-tasks`.
  `/speckit-taskstoissues` can feed the GitHub issue backlog.
- Spec Kit has no free-form brainstorm step. `/speckit-specify` plus
  `/speckit-clarify` take its place.
- The scripts are bash (`sh`), so they run in Git Bash locally and on the Linux
  GitHub Actions runners the `@claude` agent uses (Phase 2).
- Extra local tooling: uv and specify-cli. Both are free, so the budget stays $0.
- Spec Kit's folder layout (`specs/NNN-feature/`, `.specify/memory/constitution.md`)
  must be reconciled with the roadmap's `docs/spec/PRODUCT.md` in Session 03.

# Handoff → Session 06: Backlog (issue template, labels, issues)

**Model:** sonnet · **Effort:** high · Mechanical but outward-facing (public repo).

## Before you start
`docs/mvp-spec` → `docs/mvp-plan` → `docs/mvp-tasks` are stacked and unmerged. Ask Sam
whether to open PRs / merge them first. Branch `docs/backlog` off `docs/mvp-tasks`
if not.

## Goal
Last two unticked Phase 1 ROADMAP items: issue template + labels, then MVP issues from
`specs/001-mvp/tasks.md` (`/speckit-taskstoissues`), plus demo issues from the spec's
Backlog section (`status:ready` candidates, see `docs/DEMO.md` Part 2).

## Files to open
`specs/001-mvp/tasks.md` · `specs/001-mvp/spec.md` (Backlog section only) ·
`.specify/memory/constitution.md` (Principle IV) · `docs/DEMO.md` (Part 2)

## Decisions to respect
- 168 tasks, one issue each. Labels needed: phase, story (us1–us6), `manual` (🧑 tasks,
  Sam does them), `status:ready`, `backlog`. Issue template: goal, acceptance criteria,
  files to touch, out of scope.
- Dependencies between issues come from tasks.md ("must pass", Dependencies section).
- Repo is public: no secrets or real emails in issues.

## Don't
- Don't create 168 issues without Sam's go-ahead: show the plan (labels, naming, a dry
  run of 3 issues) first. Creating issues is outward-facing and slow to undo.
- Don't implement tasks, link Cloudflare/Supabase, or touch the MCP work.

## Decided by Sam (session 05, no change to tasks.md needed)
1. T019 may edit `contracts/environment.md` via its own PR.
2. `E2E_PASSWORD` stays a test-only variable, outside the contract.
3. First admin on the hosted project: dashboard user + one SQL insert (T090).
4. Claude Action (T020/T021) uses the subscription OAuth token, no paid API key.

## Done when
Template, labels and issues exist, ROADMAP Backlog line ticked → `session-journal` →
`next-step`.

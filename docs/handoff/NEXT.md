# Handoff → Session 05: Generate MVP tasks

**Model:** sonnet · **Effort:** high · Breaking a plan into tasks.

## Before you start
`docs/mvp-spec` and `docs/mvp-plan` (stacked) aren't merged into `main` yet. Ask Sam
whether they have been. If not, branch `docs/mvp-tasks` off `docs/mvp-plan`.

## Goal
Run `/speckit-tasks` for `specs/001-mvp` to produce `specs/001-mvp/tasks.md`, then run
`/speckit-analyze` and fix any CRITICAL or HIGH findings in tasks.md. (Plan or spec
fixes need Sam's approval first.)

## Files to open
`specs/001-mvp/plan.md` (see its "Delivery slices") · `data-model.md` ·
`contracts/access-matrix.md` · `contracts/database-api.md` · `contracts/app-surface.md`
· `quickstart.md` · `.specify/memory/constitution.md`

## Decisions to respect
- ADRs 0004–0008. Stack: Next.js 16 / TS 6.0 on Cloudflare Workers (OpenNext),
  Supabase, Brevo, Docker locally. Demo users = employees padding the real team.
- Tests aren't optional (Constitution V). Every access-matrix row gets a pgTAP task
  with an allowed case and a refused case, before or alongside the code it tests.
- Phase 2 (pipeline: skeleton on Workers, CI, previews, keep-alive) comes before the
  Phase 3 feature slices. The tasks should show that order.
- Tasks need to be small and issue-sized (Constitution VII), because they become
  GitHub issues next.

## Don't
- Don't run `/speckit-taskstoissues` or `/speckit-implement`, write app code, or link
  Cloudflare/Supabase.
- Don't put MCP server work in tasks.md. `docs/spec/MCP-TOOLS.md` is Phase 4. Read
  `docs/DEMO.md` only for what the backlog demo issues must support.

## Done when
tasks.md is committed and pushed, and ROADMAP's Tasks line is ticked →
`session-journal` → `next-step`.

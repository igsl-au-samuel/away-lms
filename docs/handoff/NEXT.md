# Handoff → Session 36: Google Calendar sync on approval (Phase 4) — PLAN FIRST

**Model:** opus · **Effort:** high (plan mode) — then sonnet/medium to build.

## State
Supabase MCP (dev) is done (ADR 0012, branch `chore/supabase-mcp-dev`, one commit, not yet pushed or PR'd).
LMS MCP server (ADR 0011) is merged on `main`.

## Goal
When a manager approves a leave request, create a Google Calendar event for it. Start with a plan, because this
touches the schema, auth and an external API. Decide where the sync runs (Postgres trigger or queue, a Worker, or
the app) and how Google credentials are held. Write an ADR.

## Done when
- A plan is agreed with Sam (calendar target, event shape, failure and retry, cancel/decline handling).
- Free tier only. Ask before adding any service or dependency with a cost.
- No secrets in the repo (it's public). Use env vars.

## Open first
- `docs/ROADMAP.md` (Phase 4), `specs/001-mvp/plan.md`
- `specs/001-mvp/contracts/access-matrix.md`
- `docs/decisions/0011-lms-mcp-local-stdio.md`

## Don't touch
- T017, T166–T168, Cloudflare config, the hosted DB.

## Housekeeping
Push `chore/supabase-mcp-dev` and open a PR first if Sam hasn't already (no `Closes` issue exists for it).

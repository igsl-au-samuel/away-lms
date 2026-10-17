# Handoff → Session 33: LMS MCP server (Phase 4)

**Model:** opus plans (plan mode) → sonnet builds · **Effort:** high → medium

## State
Phase 3 core app is merged to main and live; hosted DB has the schema (Deploy DB workflow,
#220). Sam is signed in as admin on production. PR #221 (docs: BOOTSTRAP + journal) is open;
merge it once green. Open review findings: #213–#217.

## Goal
Local stdio LMS MCP server in `/mcp` (TypeScript MCP SDK) so Claude Code can query, submit
and approve leave. Tools map onto existing RPCs; no new DB work expected.

## Done when
- `/mcp` builds and runs over stdio; registered in Claude Code via a project `.mcp.json`.
- Tools from the draft list work against local Supabase: query balance/requests, submit,
  approve/decline (manager).
- Authorizes as a real user (sign-in with email + password, per-user session). Never the
  service/secret key. RLS and RPCs stay the only authorization.
- Tests for each tool; lint, typecheck, tests green.

## Open first
- `docs/spec/MCP-TOOLS.md` (draft tool list)
- `specs/001-mvp/contracts/database-api.md` (RPCs to call)
- `specs/001-mvp/plan.md` lines 151+ (forward-compat note)

## Respect
- Public repo: no secrets, no `.env*`. Credentials via env vars read at runtime.
- Budget $0; ask before adding any paid service. New deps must be free.
- Plan mode first (touches a new package + auth). One PR, branch `feat/mcp-server`.

## Don't touch
Cloudflare, T017, the hosted DB directly. T166–T168 (Sam's manual checks) are parked.
Google Calendar sync is a separate task after this.

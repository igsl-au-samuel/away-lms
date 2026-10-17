# Handoff → Session 35: wire Supabase MCP into Claude Code (dev)

**Model:** sonnet · **Effort:** medium

## State
PR #222 (LMS MCP server, `lms` in `.mcp.json`) has been reviewed and its fixes pushed. CI is green and it waits
for Sam to merge (closes #223). Start this task from `main` after that merge.

## Goal
Register a Supabase MCP server in `.mcp.json` for **local development only**. Claude Code can then
inspect the local schema, tables and logs.

## Done when
- `.mcp.json` has a `supabase` entry pointing at the **local** stack (port 55321, see
  `supabase/config.toml`). First check whether the local Supabase CLI serves MCP at
  `/mcp`. If it doesn't, use `@supabase/mcp-server-supabase` in read-only mode.
- It never points at the hosted project and needs no secrets in the repo. Use `${VAR}`
  expansion if anything is needed.
- A short "Supabase MCP (dev)" section in `mcp/README.md`, and an ADR if a real choice was made.
- Tick the roadmap line. Then run session-journal and next-step.

## Open first
- `.mcp.json`, `mcp/README.md`, `supabase/config.toml`, `docs/decisions/0011-lms-mcp-local-stdio.md`

## Don't touch
- The DB schema, Cloudflare, the hosted DB, T017, T166–T168.
- Any paid service. The budget is $0 (ask first).

## After this
Google Calendar sync on approval (Phase 4).

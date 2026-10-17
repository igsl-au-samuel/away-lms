# 0012 Supabase MCP (dev): local Studio endpoint, read-only

**Status:** accepted

**Context:** Claude Code should be able to inspect the local schema, tables, advisors and
logs. The handoff said to try the local CLI's `/mcp` first and fall back to
`@supabase/mcp-server-supabase` if the CLI doesn't serve it.

**Findings (Supabase CLI 2.121.0):**

- `supabase status` lists `MCP_URL` as `http://127.0.0.1:55321/mcp` (through Kong). A
  POST there returns an empty `400`, with or without an `Origin` header.
- Studio serves the same MCP server at `http://127.0.0.1:55323/api/mcp` (11 tools). The
  `?read_only=true` query drops `apply_migration` and runs `execute_sql` in a read-only
  transaction. A probe `CREATE TABLE` failed with "cannot execute CREATE TABLE in a
  read-only transaction", and a `SELECT` worked.

**Decision:**

- Register `supabase` in `.mcp.json` as an HTTP server at
  `http://127.0.0.1:55323/api/mcp?read_only=true`. It is bound to localhost, needs no
  secrets and no new dependency, and cannot reach the hosted project.
- No `@supabase/mcp-server-supabase` package. It would need a personal access token and
  is aimed at hosted projects.
- Schema changes still go through migration files and pgTAP, not through the MCP server.
  This keeps RLS and the access matrix as the single source of truth.

**Consequences:** The server only works while `npx supabase start` is running. If a later
CLI makes the Kong `/mcp` route work, the URL can switch with no other change. The read-only
flag is a client-side URL setting, so don't remove it.

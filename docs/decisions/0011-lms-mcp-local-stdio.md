# 0011 LMS MCP server: local stdio, signed in as a real user

**Status:** accepted

**Context:** Phase 4 needs Claude Code to query, submit and approve leave through the
existing RPCs. Using the service key would bypass RLS and make the MCP server a second
authorization layer.

**Decision:**

- **Auth:** email and password sign-in with the publishable key, done lazily, from `LMS_*`
  env vars (never in the repo). The server refuses to start if `SUPABASE_SECRET_KEY` is
  set or the key is a secret or service_role key. RLS and the RPCs remain the only
  authorization.
- **Location:** `mcp/src/` in the root package, plus `@modelcontextprotocol/sdk` (MIT). It
  reuses the generated types, the error copy and the test helpers, and the existing CI
  covers it. Nothing in `src/` imports it.
- **Runtime:** `node --import tsx mcp/src/index.ts`, registered as `lms` in `.mcp.json`
  with `${VAR}` expansion.
- **Tools:** leave types by name, ISO dates only, and a read-only `preview_leave` before
  `submit_leave`. Writes are annotated, and approve and decline are marked destructive.
  `cancel_request` waits for a cancel RPC.

**Consequences:** One server instance acts as one user; switching user means a restart.
The password lives in the user's env, which is fine locally. The remote server will need
OAuth via Supabase Auth, and may split `mcp/` into its own package.

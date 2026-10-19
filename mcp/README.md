# Away LMS MCP server (local, stdio)

Lets Claude Code check balances, submit leave, and approve or decline requests in Away.
It signs in as **one real user** with an email and password, so Postgres RLS and the RPCs
decide what that user may do. This is the same as the web app. The server never uses the
secret key, and it refuses to start if one is set (ADR 0011).

## Tools

| Tool | Who | Writes |
|---|---|---|
| `whoami` | everyone | no |
| `get_balance` | everyone | no |
| `list_my_requests` | everyone | no |
| `preview_leave` | everyone | no |
| `submit_leave` | everyone | yes |
| `team_calendar` | everyone | no |
| `list_pending` | manager, admin | no |
| `preview_decision` | manager, admin | no |
| `approve_request` | manager, admin | yes |
| `decline_request` | manager, admin | yes |

Dates are ISO `YYYY-MM-DD`. Leave types are passed by name, for example `Annual`.

This local server doesn't ask for a `confirmation` token on writes. The remote server does: the
preview tools (`preview_leave`, `preview_decision`) return one, and the write must send it back.

## Setup

1. Set these in your shell or user environment, **never in the repo**:

   | Variable | Value |
   |---|---|
   | `LMS_SUPABASE_URL` | Local: `API_URL` from `npx supabase status -o env`. |
   | `LMS_SUPABASE_PUBLISHABLE_KEY` | The publishable key (`PUBLISHABLE_KEY`), never the secret key. |
   | `LMS_EMAIL` / `LMS_PASSWORD` | The Away account to act as, e.g. `manager@away.test` from `npm run seed:local`. |

   PowerShell (current user, persistent):
   ```powershell
   [Environment]::SetEnvironmentVariable("LMS_EMAIL", "manager@away.test", "User")
   ```
   Restart VS Code or the terminal afterwards so Claude Code sees the variables.

2. The repo's [`.mcp.json`](../.mcp.json) registers the server as `lms`. Claude Code asks
   you to approve project servers the first time. Check it with `claude mcp list`, or with
   `/mcp` inside a session.

3. Try it: "What's my leave balance?", "Book annual leave 9–13 November 2026",
   "What's waiting for my approval?"

Run it by hand with `npm run mcp`. It waits for MCP messages on stdin and logs to stderr.

## Tests

- `tests/unit/mcp-session.test.ts`: env checks, the secret-key guard, leave-type lookup and
  error text.
- `tests/integration/mcp-tools.test.ts`: every tool against local Supabase, over an
  in-memory MCP transport.
- `tests/integration/mcp-stdio.test.ts`: spawns the real entry point over stdio.

## Supabase MCP (dev)

`.mcp.json` also registers `supabase`, so Claude Code can inspect the **local** database:
tables, extensions, migrations, advisors, logs and generated types. It points at
`http://127.0.0.1:55323/api/mcp?read_only=true`, the MCP endpoint served by local Studio.

- Start the stack first with `npx supabase start`. No env vars or secrets are needed.
- `read_only=true` removes `apply_migration` and makes `execute_sql` read-only. Change the
  schema with migration files, not through this server.
- It never reaches the hosted project.
- `supabase status` lists `MCP_URL` on port 55321, but that route returns `400` on CLI
  2.121.0. The Studio URL works. See ADR 0012.

## Not yet

- `cancel_request`: there's no cancel RPC yet (spec backlog item 3).
- A remote (HTTPS) server for Claude chat. That's the Phase 4 stretch item.

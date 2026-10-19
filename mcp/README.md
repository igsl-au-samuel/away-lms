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

## Remote (Claude chat)

The same tools are served over HTTPS at `https://away.samuel-tse.workers.dev/mcp`, so you can use
Away from Claude chat (claude.ai, desktop or mobile). You sign in once with your own Away account
and everything runs **as you**: the database decides what you may see and do, the same as the web
app. The server never holds the secret key or your password (ADR 0015, spec:
[`docs/spec/REMOTE-MCP.md`](../docs/spec/REMOTE-MCP.md)).

### Add the connector
1. In Claude, open Settings, then Connectors, then **Add custom connector**.
2. Name: `Away`. URL: `https://away.samuel-tse.workers.dev/mcp`.
3. Open **Advanced settings**. Paste the Client ID below into *OAuth Client ID* and leave
   *OAuth Client Secret* empty. The Client ID is not a secret.
4. Add it, then choose **Connect**. A browser tab opens.

| Setting | Value |
|---|---|
| Client ID | `107e911c-931e-4c65-8950-187a897e5ed2` |

### What you see on the consent page
Sign in to Away if you aren't already. The page "Connect *app name* to Away?" shows the app, the
host it will send you back to (it should be `claude.ai` or `claude.com`), and who you are signed in
as. It says that approving lets the app act as you: read your leave and the team calendar, submit
leave, and decide requests if you are a manager. **Approve** sends you back to Claude. **Deny**
stops. A deactivated account sees "account not active" and can't approve.

### Writes are previewed first
`preview_leave` and `preview_decision` show what would happen and return a `confirmation` code.
`submit_leave`, `approve_request` and `decline_request` refuse to run without the code from a
preview of the same user and arguments (valid for 10 minutes). Claude should show you the preview
and ask before it writes. Claude's own approval prompt still applies.

### Limits
60 calls per minute per IP and per user. Past that, `/mcp` answers 429 with a `Retry-After`
header. Access tokens last up to an hour; Claude refreshes them itself. Claude chat calls from a
small pool of Anthropic IPs, so the per-IP count is shared by everyone on the team. On the Free
plan the Worker is allowed 10 ms of CPU per request and measured more than that on most requests
(median 34.5 ms, see `docs/spec/REMOTE-MCP.md`); they still returned normally.

### Disconnect
In Claude, remove the connector (Settings, Connectors). To also cut the access off on the Away
side, Sam revokes the grant or signs the user out everywhere in the Supabase dashboard (Auth).
There is no connected-apps page in Away yet (spec backlog). Deactivating a person in Away blocks
their next call at once.

### For operators
Cloudflare variables, none of them in the repo: `MCP_ALLOWED_CLIENT_IDS` (the Client ID above),
`MCP_CONFIRM_SECRET` (secret, 32+ characters) and the `MCP_LIMITER` rate-limit binding in
`wrangler.jsonc` (without it the limiter falls back to in-memory). Supabase: OAuth server on,
consent path `/oauth/consent`, dynamic registration off. Checklist: the security list in
[`REMOTE-MCP-PLAN.md`](../docs/spec/REMOTE-MCP-PLAN.md). Demo script: [`docs/DEMO.md`](../docs/DEMO.md).

## Tests

- `tests/unit/mcp-session.test.ts`: env checks, the secret-key guard, leave-type lookup and
  error text.
- `tests/integration/mcp-tools.test.ts`: every tool against local Supabase, over an
  in-memory MCP transport.
- `tests/integration/mcp-stdio.test.ts`: spawns the real entry point over stdio.
- `tests/integration/mcp-remote.test.ts`: the `/mcp` route with real OAuth tokens: refusals first,
  then write guards, rate limits and the demo sequence.

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
- A connected-apps page in Away to revoke the remote connector (spec backlog).

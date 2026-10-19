# LMS MCP server — tool list (input to the spec session)

Needed by `docs/DEMO.md`. This is a starting set; the spec session decides the final
shape. Tool names and **descriptions** matter: the AI picks tools by reading them.

| Tool | Who can use | Writes? | Description (draft) |
|---|---|---|---|
| `get_balance` | employee+ | no | Get the current user's leave balance per leave type, plus pending days. |
| `list_my_requests` | employee+ | no | List the current user's leave requests, optionally filtered by status. |
| `submit_leave` | employee+ | **yes** | Submit a leave request: leave type, start date, end date, optional note. Starts as pending. |
| `cancel_request` | employee+ | **yes** | Cancel one of the user's own pending or future approved requests. |
| `team_calendar` | employee+ | no | Show who is on leave between two dates. |
| `list_pending` | manager, admin | no | List leave requests waiting for the current user's approval. |
| `approve_request` | manager, admin | **yes** | Approve a pending request. Only for the manager's own reports. |
| `decline_request` | manager, admin | **yes** | Decline a pending request with a reason. |

## Rules
- Every write tool must show the user what it will do before running, so the host's approval prompt is meaningful.
- Dates are ISO (YYYY-MM-DD). The tool resolves nothing relative. Claude passes the actual date.
- Role and ownership are checked in the tool, not trusted from the prompt.
- Return short, plain-language text plus structured data. Never return other users' private data to an employee.
- Demo auth is one connector tied to a demo user (decision for the spec session: single-user token vs OAuth through Supabase Auth).

## Open questions for the spec session
- Local (stdio, Claude Code only) first, then remote (HTTPS, Claude chat)? Recommended: yes.
- Hosting the remote server: a route in the Next.js app on Vercel vs a separate service.
- Half-days, public holidays and carry-over: MVP or backlog?

## Status after the spec and plan (2026-10-16)
- **Local first, then remote:** yes. It's in ROADMAP Phase 4.
- **Remote hosting:** the app is on Cloudflare Workers now (ADR 0005), not Vercel.
  A route in the same Worker or a separate Worker gets decided in Phase 4.
- **Half-days, holidays, carry-over:** public holidays (QLD, NSW, HK) are in the MVP.
  Half-days and carry-over are backlog.
- **Mapping to the planned database API** (`specs/001-mvp/contracts/database-api.md`):
  `get_balance` → `get_balances` · `list_my_requests` → `leave_requests` read ·
  `submit_leave` → `submit_leave_request` · `team_calendar` → `team_calendar` ·
  `list_pending` → `approval_queue` · `approve_request` / `decline_request` →
  `decide_leave_request`. **`cancel_request` needs spec Backlog item 3** (cancel or
  withdraw) to be built first.
- **"Checked in the tool, not trusted from the prompt":** the MCP server calls those
  functions with the user's own Supabase session, so the database enforces the same
  rules as the web app, and the MCP server never holds the secret key.
- **Demo auth:** demo employees can sign in (ADR 0004), so a single demo-user token is
  possible. Phase 4 decides between that and OAuth.

## Built: local stdio server (2026-10-17, ADR 0011)
Code is in `mcp/`, with setup in `mcp/README.md`. It's registered as `lms` in `.mcp.json`.
- **Final tools:** `whoami`, `get_balance`, `list_my_requests`, `preview_leave`,
  `submit_leave`, `team_calendar`, `list_pending`, `approve_request`, `decline_request`.
- **Added beyond the draft:**
  - `whoami`, so Claude can confirm who it acts as.
  - `preview_leave`, a read-only check of working days and balance that lets Claude show
    the effect before `submit_leave`.
- **Not built:** `cancel_request`, which waits for a cancel RPC (spec backlog item 3).
- **Demo auth:** one user per server instance, signed in with email and password from env
  vars. There's no service key. OAuth is for the remote server.
- **Leave types by name:** leave types are passed by name (case-insensitive). An unknown
  name lists the valid ones.

## Remote server for Claude chat (spec 2026-10-19, ADR 0014)
Spec: `docs/spec/REMOTE-MCP.md`. It uses the same 9 tools from one shared registry, plus
`preview_decision`. Remote write tools need a `confirmation` token from a preview. Auth is
Supabase OAuth 2.1 with one pre-registered client. Build plan: #233.

## Built: preview_decision and confirmations (#239, 2026-10-19)
- `createLmsServer(getSession, { requireConfirmation, confirmSecret })`. Local stdio keeps
  `requireConfirmation: false`; the remote route will pass `true` (#242).
- `preview_decision(request_id, outcome)`: manager/admin, read-only. Reads `approval_queue`, shows
  requester, type, dates, working days, note and balance, and returns `confirmation`. A request
  that isn't in the queue gives `not_found`. No new RPC.
- `preview_leave` returns `confirmation` only when it found no problems.
- With the flag on, `submit_leave`, `approve_request` and `decline_request` refuse with
  `confirmation_required` unless the token matches user, tool and bound arguments (`confirmation.ts`).
  `submit_leave` reads the leave types first to get the id it is bound to, but makes no write RPC.
  All failure causes give the same message.

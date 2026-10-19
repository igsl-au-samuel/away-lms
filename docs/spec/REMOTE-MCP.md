# Remote LMS MCP server for Claude chat: spec

Issue #232 · ADR 0014 · Phase 4. Agreed with Sam on 2026-10-19. Spec only. The plan and build
issues come from #233.

## Goal
A person adds Away as a custom connector in Claude chat (claude.ai, desktop or mobile), signs in
once with their own Away account, and can then check balances, preview and submit leave, see the
team calendar, and (as a manager) approve or decline. Everything runs **as that person**, through
the same RPCs and RLS as the web app.

**Not in scope:** admin tools (people, allowances, demo data), `cancel_request` (it waits for the
cancel RPC, spec backlog item 3), other organisations or tenants, and a "connected apps" page
(backlog).

## What already exists
- The local stdio server in `mcp/` (ADR 0011) exposes 9 tools. `createLmsServer(getSession)` in
  `mcp/src/tools.ts` takes a session provider and knows nothing about the transport or how the
  user signed in.
- Local auth is an email and password from env vars, one user per process. That's fine on a
  laptop and wrong for a public endpoint.
- `supabase/config.toml` already has an `[auth.oauth_server]` block (disabled). Supabase Auth can
  act as an OAuth 2.1 authorization server, issue the user's own JWT to a third-party client, and
  send the person to a consent page that we host.
- RLS helpers only count active profiles (`private_helpers.sql`). A deactivated user's token
  stops working on the next call.

## Architecture

```text
Claude chat ──POST /mcp (Bearer <access token>)──▶ Away Worker (Next.js route)
                                                     │ 1. verify JWT (Supabase JWKS)
                                                     │ 2. client_id on allowlist?
                                                     │ 3. supabase-js with the user's token
                                                     ▼    + publishable key
                                                   Supabase: whoami → tool RPC (RLS applies)

First connect (OAuth 2.1 + PKCE):
Claude ──GET /mcp──▶ 401 + WWW-Authenticate: resource_metadata=/.well-known/oauth-protected-resource
Claude ──▶ /.well-known/oauth-protected-resource (Away)   → authorization server = Supabase Auth
Claude ──▶ Supabase /authorize ──redirect──▶ Away /oauth/consent?authorization_id=…
             (sign in if needed) ── Approve ──▶ Supabase ──code──▶ Claude callback
Claude ──▶ Supabase /token (code + PKCE verifier) → access + refresh token
```

- The MCP server **never** holds the secret key, never sees a password, and never refreshes
  tokens. Claude refreshes them directly with Supabase.
- Each `/mcp` call makes a few subrequests (whoami, one or two RPCs, and the JWKS fetch, which is
  cached), well under the 50 a free Worker allows.

## Decision 1: hosting is a route in the existing Worker
- `src/app/mcp/route.ts` runs the MCP SDK's web-standard Streamable HTTP transport in
  **stateless** mode: no session id, and a new `McpServer` per request. POST does the work, and
  GET and DELETE return 405 (no server-sent stream is needed).
- `src/app/.well-known/oauth-protected-resource/route.ts` serves the RFC 9728 metadata that
  points at the Supabase auth server.
- **Why the same Worker:** the consent page has to live in the app anyway (Supabase redirects to
  `site_url` + `authorization_url_path`). It means one domain, one deploy and one set of
  variables, and it's free.
- **Gate (in the plan, before building):** measure the gzipped Worker upload before and after
  adding the route (the free limit is 3 MiB), and check that a tool call stays inside the free CPU
  budget. **Fallback if it's over:** a separate Worker `away-mcp` that imports the same shared
  module. The consent page stays in the app. Record the measured numbers here.

## Decision 2: auth is Supabase OAuth 2.1 with one pre-registered client (ADR 0014)
- **Authorization server:** Supabase Auth's OAuth server. Locally:
  `[auth.oauth_server] enabled = true`, `authorization_url_path = "/oauth/consent"`,
  `allow_dynamic_registration = false`. Hosted: Sam turns it on in the dashboard.
- **Client:** one **public** client (PKCE, no secret), registered by Sam, whose redirect URIs are
  Claude's connector callback(s). The Client ID isn't a secret. It goes in `mcp/README.md`, and
  each person pastes it into the connector's advanced settings when adding it.
- **Consent page `/oauth/consent`:**
  - People who aren't signed in go to `/sign-in?next=<consent URL>`. Sign-in has to learn `next`,
    reusing `src/lib/safe-next.ts`.
  - The page shows the app name, the redirect host, the signed-in user, and what the connector
    can do ("act as you in Away: read your leave and the team calendar, submit leave, and decide
    requests if you are a manager").
  - Approve and Deny call Supabase's approve-authorization and deny-authorization APIs. Only an
    active profile can approve; anyone else gets the "account not active" copy.
  - It follows `docs/design/DIRECTION.md`.
- **Token checks on every `/mcp` call, in this order, with any failure returning 401 and
  `WWW-Authenticate: Bearer resource_metadata="…"`:**
  1. A bearer token is present and is a JWT signed by our Supabase project (verified against the
     JWKS with asymmetric signing keys, or `auth.getClaims`). It isn't expired, and `iss` is our
     auth URL.
  2. `client_id` is in `MCP_ALLOWED_CLIENT_IDS`. That refuses web-session tokens (they have no
     `client_id`) and tokens issued to any other client, so there is no token passthrough.
  3. `whoami` returns a profile. A null profile (deactivated or missing) returns a tool error
     `not_allowed`, the same as local.
- **Rejected:**
  - **Demo bearer token:** a long-lived shared secret, one user for everyone, and it would need a
    token→user mapping that is a second auth path outside Supabase.
  - **Cloudflare `workers-oauth-provider`:** a second authorization server with its own storage,
    duplicating Supabase Auth.
  - **Dynamic client registration:** anyone could register a client and send a convincing consent
    link (consent phishing). For a team of about 4 plus a demo, one paste is a fair price.

## Decision 3: tools
Remote exposes the **same 9 tools** as local, with the same names and descriptions, from one
registry:

| Tool | Who | Writes | Remote change |
|---|---|---|---|
| `whoami` | everyone | no | none |
| `get_balance` | everyone | no | none |
| `list_my_requests` | everyone | no | none |
| `preview_leave` | everyone | no | also returns `confirmation` |
| `submit_leave` | everyone | **yes** | requires `confirmation` |
| `team_calendar` | everyone | no | none |
| `list_pending` | manager, admin | no | none |
| `preview_decision` (new) | manager, admin | no | shows requester, dates, type and working days; returns `confirmation` |
| `approve_request` | manager, admin | **yes** (destructive) | requires `confirmation` |
| `decline_request` | manager, admin | **yes** (destructive) | requires `confirmation` |

Role checks stay in the RPCs. The tool list doesn't change by role, because hiding tools would be
the server acting as a second authorization layer. A manager tool called by an employee returns
the RPC's refusal.

## Decision 4: writes need a preview token
The host's approval prompt is the person's confirmation, but someone can click "always allow".
The server therefore insists that each write is exactly what was previewed.

- `preview_leave` and `preview_decision` return
  `confirmation = base64url(payload) + "." + HMAC-SHA256(payload, MCP_CONFIRM_SECRET)`, where
  `payload = { sub: user_id, tool, args, exp }`, `args` are the canonical bound arguments, and
  `exp` is 10 minutes ahead.
  - `submit_leave` binds the leave type id, start and end date. The note isn't bound.
  - Approve and decline bind the request id and outcome. The comment or reason isn't bound.
- `submit_leave`, `approve_request` and `decline_request` take a required `confirmation` input.
  They refuse with error `confirmation_required` and the message "Run preview first and show the
  result to the person" when the token is missing, malformed, expired, has a bad signature,
  belongs to another `sub`, or doesn't match the arguments.
- A replay inside the 10 minutes is harmless: the RPCs refuse an overlapping request and a
  decision on a request that isn't pending.
- `MCP_CONFIRM_SECRET` is a Cloudflare secret that Sam sets, and it's never in the repo. WebCrypto
  HMAC needs no new dependency.
- Tool descriptions tell Claude to preview, show the result, and ask before writing. The
  annotations stay as they are (approve and decline are `destructiveHint: true`).
- **Local stdio:** `confirmation` is optional there, because Claude Code already prompts on every
  write. Same registry, with a flag on `createLmsServer`. To revisit if it causes confusion.
- **Later:** if Claude chat supports MCP elicitation, the server could ask the person directly
  instead. Not needed for the MVP.

## Threat model

| Threat | Mitigation | What's left |
|---|---|---|
| Stolen access token | Expires in ≤1 h (`jwt_expiry = 3600`); refresh rotation is on; it carries only that user's RLS powers | It also works against the Supabase REST API directly with the publishable key. Accepted: that's no more than the user can already do in the web app |
| Stolen refresh token | Rotation with a 10 s reuse window; revoke the grant or the user's sessions in the Supabase dashboard (Sam) | No self-service revoke until a "connected apps" page exists (backlog) |
| Leaver or compromised account | Deactivating the profile blocks the next call (RLS checks `is_active`, and `whoami` returns null) | None for data; the token may still pass the JWT check until it expires |
| Web-session token replayed at `/mcp` | `client_id` allowlist | None |
| Consent phishing | DCR off; one allowlisted client; the consent page shows the redirect host | Someone tricked into approving the *real* client gains nothing |
| Over-broad scope | Supabase has no custom scopes, so the tool subset is the scope and RLS is the gate | Accepted |
| Write without real consent | Host approval prompt plus a preview token bound to user and arguments | A model that previews and writes without showing the person; the host prompt still applies |
| Flooding or cost | Per-user and per-IP rate limit on `/mcp` (Workers rate-limiting binding if it's free; otherwise best-effort in memory) plus Supabase's own auth limits | Free-tier quotas are a ceiling; when one is hit, the service stops rather than costing money |
| Leaking data into logs | Log only the tool name, user id, outcome and duration. Never tokens, notes, comments or request bodies | None |
| Demo logins (ADR 0004) | Same exposure as the web app; demo logins stay off when not presenting | Same as the web app |
| Errors that reveal internals | Reuse `toActionResult` and `copyFor` (`src/lib/errors.ts`), so only friendly codes and copy are returned | None |

## Reuse of `/mcp`
- Move the transport-free core (`tools.ts`, `format.ts`, the `Session` type and `loadViewer`)
  into a shared module that both the stdio entry and the Next route import. The plan picks the
  path (for example `src/server/mcp/`). `isPrivilegedKey`, `readEnv` and the password provider
  stay in `mcp/` (stdio only; `Buffer`).
- Remote session provider: `createClient(url, publishableKey, { global: { headers: {
  Authorization: "Bearer <token>" } }, auth: { persistSession: false, autoRefreshToken: false } })`
  followed by `loadViewer`.
- ADR 0011's "nothing in `src/` imports it" is superseded by ADR 0014.

## Tests (the plan expands these; refusals come first)
- **Unit:**
  - Token checks: missing, malformed, bad signature, expired, wrong `iss`, no or unknown
    `client_id`.
  - Preview token: tampered payload, bad signature, expired, other user, argument mismatch, and
    the happy path.
- **Integration (local Supabase with the OAuth server on):**
  - Get a token through the OAuth flow for a seeded employee and a seeded manager.
  - `/mcp` without a token, or with a web-session token, returns 401 with the metadata header.
  - An employee calling `list_pending`, `preview_decision` or `approve_request` gets refused.
  - An employee never sees another person's leave type or notes (access matrix rows that apply,
    `specs/001-mvp/contracts/access-matrix.md`).
  - A deactivated user gets `not_allowed`.
  - A write without, or with a stale, `confirmation` is refused, and nothing is written.
- **No new pgTAP:** no new policies or RPCs are planned. If the plan finds `preview_decision` needs
  a new RPC, that RPC gets pgTAP refusal tests the usual way.
- **Manual (Sam):** connect Claude chat to a preview deploy, run the MCP part of the demo script
  (`docs/DEMO.md`, Phase 5) as an employee and as a manager, then disconnect.

## Manual steps for Sam (label `manual` in #233)
1. Hosted Supabase: enable the OAuth server, set the consent path, keep dynamic registration off.
2. Register the public client with Claude's callback URL(s), and put the Client ID in
   `mcp/README.md`.
3. Supabase Auth URL settings: make sure the site URL is the deployed app.
4. Cloudflare: set `MCP_CONFIRM_SECRET` (secret) and `MCP_ALLOWED_CLIENT_IDS`, and the
   rate-limit binding if used.
5. Claude chat: add the custom connector (`https://<app>/mcp` plus the Client ID) and sign in.

## To check in the plan (#233), before any build issue
- **Budget:** the Supabase OAuth server is available on the Free plan; the Workers rate-limiting
  binding is available on Workers Free. If either isn't, stop and ask Sam.
- The exact Claude connector callback URL(s), and that Claude chat accepts a Client ID without a
  secret.
- The SDK export for the web-standard Streamable HTTP transport in `@modelcontextprotocol/sdk`
  ^1.32, and that it runs under OpenNext on Workers.
- The supabase-js API names for the consent flow (get authorization details, approve, deny), and
  the claims in an OAuth-issued access token (`client_id`, `aud`, `iss`).
- Whether the project uses asymmetric JWT signing keys (JWKS) or needs `auth.getClaims`.
- The Worker bundle size before and after (Decision 1 gate).
- Whether `preview_decision` can use the existing `approval_queue` read, or needs a small RPC.

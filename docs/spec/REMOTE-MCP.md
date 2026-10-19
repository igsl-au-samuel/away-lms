# Remote LMS MCP server for Claude chat: spec

Issue #232 · ADR 0015 · Phase 4. Agreed with Sam on 2026-10-19. Spec only. The plan
([`REMOTE-MCP-PLAN.md`](REMOTE-MCP-PLAN.md)) and build issues come from #233.

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
- **Measured after the route (#242):** `build:worker` then `wrangler deploy --dry-run`: **Total
  Upload 10547.71 KiB, gzip 2170.59 KiB**. That is +174.38 KiB over the 1996.21 KiB baseline and
  594 KiB under the 2764.8 KiB gate, so no fallback Worker is needed. Not run locally: `preview:worker`
  (workerd could not allocate memory with about 600 MB free). The route is covered by handler
  tests and by the build output listing it.
- **Measured on the deployed Worker (#246, version 78cfac19, 2026-10-20).** CPU time per `/mcp`
  invocation, from Cloudflare Observability `cpuTimeMs`. **It is over the 10 ms Free limit.**
  Samples are small, so read these as rough, not precise.

  | Request | n | Median | Range |
  |---|---|---|---|
  | `initialize` | 2 | 98.5 ms | 24 to 173 |
  | `tools/list` | 3 | 40 ms | 26 to 391 |
  | tool calls | 8 | 32 ms | 16 to 335 |
  | `server/discover` | 4 | 30.5 ms | 20 to 474 |
  | `notifications/initialized` | 4 | 105.5 ms | 13 to 475 |
  | all 26 requests | 26 | 34.5 ms | P90 335, worst 475 |

  24 of 26 requests were over 10 ms, yet all returned normally and the Errors count is 0. That is
  unexplained. The biggest costs came during the connect handshake, not only on the first
  requests, so this is not simply cold starts.
- **CPU investigation (fix/mcp-cpu, 2026-10-20). Verdict: the cost is first-use work inside our
  path in each fresh isolate, not the OpenNext wrapper and not steady-state per-request work.**
  Two rounds, both small samples.
  1. *Production, baseline requests (Sam, 100 events from the Observability export).* `GET /mcp`
     (405) median 2 to 3 ms, max 8. `POST /mcp` with no token (401) median about 4 ms, max 7. A
     rate-limited `POST` (429) median 3 ms, one 85 ms outlier. So the whole OpenNext/Next wrapper,
     the proxy skip and our rate limiter fit inside the 10 ms. An earlier guess blamed the wrapper;
     this refutes it. Real-token requests (the 26 above) are where the CPU goes. Not measured:
     `GET /sign-in`, a truly cold isolate, and 20+ spaced real-token requests.
  2. *Local Node, our path only.* Warm loops are cheap (about 1 to 2 ms per request: client 0.05,
     server build 0.24, `getClaims` 0.2 to 0.4, full MCP round trip 0.4 to 1.1). But the **first**
     requests in a fresh process are not:

     | Request in a fresh process | createClient | getClaims | server build | connect + handle | Total |
     |---|---|---|---|---|---|
     | 1st (`initialize`) | 16 ms | 4 ms | 4.4 ms | 14 ms | about 38 ms |
     | 2nd (`tools/list`) | 0.3 | 3.2 | 0.7 | 3.5 | about 8 ms |
     | 3rd (`tools/list`) | 0.3 | 0.5 | 0.6 | 1.3 | about 2.7 ms |

     `--jitless` (interpreter only) gave the same shape. The first call into supabase-js, the MCP
     SDK and zod pays for lazy module setup and compilation; later calls are cheap. A Free
     isolate is recycled when traffic is sparse, and workerd cores are slower than a desktop, so a
     request that lands early in an isolate's life costs well over 10 ms. That fits the handshake
     (new connection, probably new isolate, `initialize` 98.5 ms median), a 13 ms warm floor and
     the 300 to 475 ms spikes. It is a fit with the data, not a profile: I can't run workerd here
     (`preview:worker` runs out of memory) and tsx adds some transpile noise to the local numbers.
  3. *Production, two no-token 401s (2026-10-19 15:18 UTC, version 78cfac19).* `server/discover`
     (colo CDG) cost **189 ms** CPU and `initialize` (colo IAD) **186 ms**, 0.76 s apart, both
     `outcome: ok`. A 401 never reaches supabase-js, yet these cost about 45 times the 4 ms 401
     median in round 1. Different colos and `executionModel: stateless` suggest fresh isolates, but
     nothing in the events proves it. If so, a cold start costs about 187 ms before any of our auth
     code runs, which weakens "not the OpenNext wrapper": the wrapper is cheap warm but probably
     not on a cold isolate. Still `ok`, not `exceededCpu`, at about 19 times the Free limit, so the
     overrun stays harmless in practice for now. Two events only.
- **Decision: no code change.** "Build `McpServer` once per isolate" would save about 0.3 ms
  (the server build is not the first-use cost) and would put per-user state in something shared
  across requests, a cross-user leak risk. Sharing one keyless `getClaims` client or using one
  client instead of two saves about 0.3 ms warm. A standalone Worker would not help: the wrapper
  is already cheap, and the same code would pay the same first-use cost. What would cut it is
  loading less code per request (for example verifying the JWT with WebCrypto alone instead of
  supabase-js), which is a redesign for an unproven gain.
- **Decision (Sam, 2026-10-20): accept the CPU overrun.** No Workers Paid. No errors were seen,
  even at 475 ms, but Cloudflare doesn't promise Free keeps allowing it. Follow-ups: re-check the
  Observability Errors card (and any non-`ok` outcome such as `exceededCpu`) after a week of team
  use, and rehearse with Claude chat before the live demo (ROADMAP).
- **Temporary timing logs (fix/mcp-cpu), to read in Observability then remove.** Each
  authenticated request logs `[mcp-timing] seq=N client_ms=… verify_ms=… total_ms=…`. **`seq` is
  the number of requests that isolate has served** (1 = first). Compare `cpuTimeMs` by `seq`: if
  the first-use theory holds, `seq` 1 to 3 should be far above 10 ms and higher `seq` close to it.
  The ms values are weak: Workers' clock only advances on I/O, so they are wall time including the
  JWKS fetch and show about 0 for pure-CPU steps like `createClient`. Sam chose logs over sending
  a web-session token from a terminal. Remove the counter, `marks` and the second `log(` in
  `src/server/mcp/handler.ts` once read.
- **Rate limiter.** Cloudflare Free accepted the `MCP_LIMITER` binding (the deploy log lists
  `env.MCP_LIMITER`, 60 requests per 60 s, for 78cfac19). The limit itself was not triggered in
  production. Claude chat calls `/mcp` from a small pool of Anthropic IPs, so the per-IP check is
  shared by the whole team and split over a few buckets.

## Decision 2: auth is Supabase OAuth 2.1 with one pre-registered client (ADR 0015)
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
| Flooding or cost | Per-user and per-IP rate limit on `/mcp` (Workers rate-limiting binding, 60 calls per 60 s per key, `MCP_LIMITER`; in-memory fallback where there is no binding). It is a loose filter: binding counts are per Cloudflare location and eventually consistent, the fallback is per isolate plus Supabase's own auth limits | Free-tier quotas are a ceiling; when one is hit, the service stops rather than costing money |
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
- ADR 0011's "nothing in `src/` imports it" is superseded by ADR 0015.

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

## Manual steps for Sam (label `manual`; issues #236, #245, #246)
0. Hosted Supabase: look at JWT Signing Keys (asymmetric or legacy). Result goes in a comment.
1. Hosted Supabase: enable the OAuth server, set the consent path, keep dynamic registration off.
2. Register the public client with Claude's callback URL(s), and put the Client ID in
   `mcp/README.md`.
3. Supabase Auth URL settings: make sure the site URL is the deployed app.
4. Cloudflare: set `MCP_CONFIRM_SECRET` (secret) and `MCP_ALLOWED_CLIENT_IDS`, and the
   rate-limit binding if used.
5. Claude chat: add the custom connector (`https://<app>/mcp` plus the Client ID) and sign in.

## Checks done on the deploy (#246, 2026-10-20)
Sam ran these on version 78cfac19. Full write-up: the comment on #246.

- **CPU: over the Free limit.** Median 34.5 ms across 26 requests (see Decision 1). Baseline
  requests (405, 401, 429) are 2 to 4 ms, so the cost is first-use work in our path per fresh
  isolate. No errors seen; accept-or-pay decision is Sam's.
- **Rate-limit binding: accepted on Free.**
- **Connect and demo: worked**, with the differences recorded in `docs/DEMO.md`: one identity per
  Claude account, every tool call asks for Allow, and a decline needs explicit wording.
- **Permissions as designed.** An employee's `approve_request` without a token gives
  `confirmation_required`. An employee's `preview_decision` on someone else's request gives
  `not_allowed`. An admin's `preview_decision` on their own request gives `not_found`.
- **Clean-up:** connector disconnected in Claude (Sam confirmed). Demo logins were deliberately
  left **on** for ongoing testing, against the #246 step 6 instruction and ADR 0004. **Switch them
  off, or change the demo password, before real colleagues start using the app.**

## Checks done in the plan (#233, 2026-10-19)
Detail and the build order are in [`REMOTE-MCP-PLAN.md`](REMOTE-MCP-PLAN.md).

- **Budget: Supabase OAuth server is on the Free plan.** The pricing page's Auth table has the row
  "OAuth 2.1 Server: Included" under Free. Docs say "no separate charge", and people who sign in
  count as monthly active users, which is a handful of people against a 50,000 allowance. ADR 0015
  stands.
- **Budget: Workers rate-limiting binding.** Cloudflare's docs show no price and no plan
  restriction (GA since 2025-09-19, `ratelimits` in wrangler config, Wrangler 4.36 or later), but
  they also never say "Free plan" in so many words. **Not proven.** The design doesn't depend on
  it: the plan has an in-memory fallback, and Sam sees whether `wrangler deploy` accepts the
  binding on the first preview deploy. Limits are per location and eventually consistent, so it's
  a loose filter, not accounting.
- **Claude connector callback.** `https://claude.ai/api/mcp/auth_callback` for web, desktop and
  mobile. Anthropic says it may move to `https://claude.com/api/mcp/auth_callback`, so register
  **both**. Claude Code uses loopback redirects, but it uses the stdio server and doesn't need this
  client. The connector dialog's OAuth Client ID and Client Secret are under Advanced settings, and
  the secret is optional, so a public client with a Client ID alone works.
- **SDK transport.** `@modelcontextprotocol/sdk` 1.32.1 is installed. The web-standard transport
  is `WebStandardStreamableHTTPServerTransport` in
  `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` (the `./*` export maps it). Use
  `new …({ sessionIdGenerator: undefined, enableJsonResponse: true })` and
  `await server.connect(transport); return transport.handleRequest(request)`. It takes and returns
  `Request`/`Response`, so there is no Node `http` dependency. Whether it runs under OpenNext on
  Workers is proven by the route task's preview deploy, not by reading.
- **Consent API (supabase-js 2.118, under `auth.oauth`).** `getAuthorizationDetails(id)`,
  `approveAuthorization(id)` and `denyAuthorization(id)`; the last two return a `redirect_url`.
  Details that come back with no `authorization_id` mean the person already consented, so redirect.
  The admin API `auth.admin.oauth.createClient(...)` registers clients (use `client_type: "public"`
  and `token_endpoint_auth_method: "none"`), which the integration tests need.
- **Token claims.** An OAuth access token carries `sub`, `role`, `aud` (= `authenticated`),
  `user_id`, `email`, `client_id`, `aal`, `amr`, `session_id`, `iss` (= `<project>/auth/v1`), `iat`
  and `exp`. A web-session token has no `client_id`. Supabase publishes authorization-server
  metadata at `<project>/.well-known/oauth-authorization-server/auth/v1`. Tokens aren't audience
  bound to our resource (`aud` is `authenticated`), so the `client_id` allowlist is the control.
- **JWKS vs `getClaims`.** Use `db.auth.getClaims(token)`. It verifies locally against the cached
  JWKS when the project has asymmetric signing keys and falls back to an Auth round trip when it
  doesn't, so the code is the same either way. It doesn't check `iss` or `client_id`, so the
  route does. Whether the hosted project uses asymmetric keys is a dashboard look for Sam (manual
  step 0); the answer only changes the subrequest count.
- **`preview_decision` needs no new RPC.** `approval_queue()` already returns the requester, leave
  type, dates, working days, note, balance and `over_balance_days` for exactly the requests the
  caller may decide, and refuses employees with `not_allowed`. The tool reads it and picks the row
  by id. A request that isn't in the result gets `not_found`. **No new pgTAP.**
- **Worker size baseline.** `wrangler deploy --dry-run` on the current build:
  **Total Upload 9723.88 KiB, gzip 1996.21 KiB** (about 1.95 MiB of the 3 MiB gate). Cloudflare's
  limits page now lists only a 64 MiB uncompressed limit and says there's no compressed limit; the
  ADR's 3 MiB gzip gate is kept as the stricter, known-safe target. The route must keep gzip under
  **2.7 MiB** (+700 KiB). The "after" number goes in the route task.
- **CPU is the bigger risk.** Workers Free allows **10 ms of CPU per invocation** and 50
  subrequests. The numbers can only be measured on a real deploy (local `wrangler dev` doesn't
  enforce them). The route task records CPU time from Workers observability for `initialize`,
  `tools/list` and a tool call. If the median is over about 7 ms, the fallback is a separate
  Worker, which has the same 10 ms, so the first remedy was thought to be a smaller per-request cost (build the
  `McpServer` once per isolate). The investigation found that isn't where the CPU goes; see Decision 1.
- **Gaps the spec didn't list.**
  - `src/proxy.ts` runs on every path except static files. `/mcp` and `/.well-known/*` must be
    excluded, so unauthenticated calls cost no Auth round trip.
  - The sign-in form and `signIn` action ignore `next`. Consent needs them to honour it
    (via `safeNext`).
  - RFC 9728 puts metadata for the resource `/mcp` at `/.well-known/oauth-protected-resource/mcp`.
    The 401 header names the URL explicitly, so serve the metadata at both that path and the
    bare path.

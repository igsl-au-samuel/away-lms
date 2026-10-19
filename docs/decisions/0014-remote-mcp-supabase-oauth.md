# 0014 Remote LMS MCP: Supabase OAuth 2.1, one pre-registered client, in the app Worker

**Status:** accepted · 2026-10-19 · partly supersedes [0011](0011-lms-mcp-local-stdio.md)

**Context:** Claude chat can only reach an MCP server over HTTPS, so the remote server is a
public endpoint that exposes leave data. The local server (ADR 0011) signs in with an email and
password from env vars, as one user, which is no good for a shared connector. Authorization must
stay in Postgres (RLS + RPCs), the budget is $0, and the team is about 4 people plus demo
employees. Full design: [`docs/spec/REMOTE-MCP.md`](../spec/REMOTE-MCP.md).

**Decision:**

- **Auth:** Supabase Auth's OAuth 2.1 server is the authorization server. Claude gets the
  person's own Supabase JWT through authorization code + PKCE, after they sign in to Away and
  approve on our `/oauth/consent` page. The MCP route calls the RPCs with that token and the
  publishable key, so RLS applies exactly as in the web app. There's no secret key, no stored
  password, and no refresh in the server.
- **Clients:** dynamic client registration stays **off**. Sam registers one public PKCE client
  with Claude's callback URL, and people paste its (non-secret) Client ID into the connector. The
  route accepts only tokens whose `client_id` is on `MCP_ALLOWED_CLIENT_IDS`, which refuses
  web-session tokens and tokens from other clients.
- **Hosting:** a stateless Streamable HTTP route (`/mcp`) in the existing Next.js Worker, next to
  the consent page and the protected-resource metadata. A separate Worker is the fallback if the
  free 3 MiB bundle limit or the CPU budget is exceeded.
- **Writes:** remote write tools require a short-lived HMAC preview token bound to the user and
  the arguments (spec, Decision 4), on top of the host's approval prompt.
- **Shared core:** the tool registry moves out of `mcp/` so that both transports import it. This
  replaces ADR 0011's rule that nothing in `src/` imports the MCP code.

**Rejected:** a demo bearer token (a shared long-lived secret, one user, a second auth path),
Cloudflare's `workers-oauth-provider` (a second authorization server), and dynamic registration
(consent phishing for little gain at this team size).

**Consequences:**
- Everyone uses their own account, and RLS is the only gate. Deactivating a profile cuts access
  on the next call.
- New surface: a consent page, sign-in `?next=` support, the token checks, and two Cloudflare
  variables plus a dashboard setting that Sam owns.
- Supabase has no custom OAuth scopes, so a connector token can do whatever the user can do in
  the web app, including against the REST API directly. Accepted, since it's no more than the
  user's own powers.
- No self-service revoke until a "connected apps" page exists (backlog). Until then, revoking
  is done in the Supabase dashboard.
- Depends on the Supabase OAuth server being on the Free plan. The plan (#233) confirms this
  before any build. If it isn't on the Free plan, this ADR is reopened.

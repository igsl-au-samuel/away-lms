# Handoff → Session 50: Build #242, the /mcp route and protected-resource metadata

**Model:** sonnet · **Effort:** high. Clear issue, but it's the auth front door and has a size gate.

## Goal
Issue #242 (`gh issue view 242`): stateless `POST /mcp` in the app Worker, discovery metadata, proxy exclusion, size gate.

## Done when
- Unit tests first, as listed in the issue (405s, 401 before any Supabase call, metadata shape, proxy matcher, log redaction).
- Integration: no token or a web-session token gives 401 plus the header; a token from `oauthTokenFor()` gets `initialize` and `tools/list` (10 tools).
- Lint, typecheck, `npm test`, `npm run test:integration`, `npm run build:worker` pass. Gzip size after the change goes in `docs/spec/REMOTE-MCP.md` Decision 1 (baseline 1996.21 KiB, gate 2764.8 KiB).
- Journal, then next-step. PR says `Closes #242`.

## Open first
- `src/server/mcp/auth.ts` (#240): `authenticate(request, { supabaseUrl, allowedClientIds, getClaims })` returns `{ ok, token, claims }` or the 401 `Response`. `parseAllowedClientIds(process.env.MCP_ALLOWED_CLIENT_IDS)`. Pass `getClaims: (t) => db.auth.getClaims(t)`.
- `src/server/mcp/tools.ts`, `src/server/mcp/session.ts`, `src/proxy.ts`, `mcp/src/index.ts` (for `isPrivilegedKey`).
- `tests/integration/helpers.ts`: `createOAuthClient()`, `oauthTokenFor(user, clientId)`, `cleanupOAuthClients()`.

## Respect
- Local OAuth server is on (`supabase/config.toml`). After pulling, run `supabase stop && supabase start` if the server is off.
- Local Auth serves AS metadata at `/auth/v1/.well-known/oauth-authorization-server` (and OIDC config), **not** at the RFC 8414 root `/.well-known/oauth-authorization-server/auth/v1`. The protected-resource metadata should name `authorization_servers: [<supabase>/auth/v1]`. Note in the PR whether hosted serves the root path; Sam verifies it in #246.
- Never log the token. The 401 body is identical for every cause.
- `.env.example` gets `MCP_ALLOWED_CLIENT_IDS=` and `MCP_CONFIRM_SECRET=` (empty values). Public repo: no real values.

## Don't touch
Hosted Supabase and Cloudflare settings (Sam: #236, #245, #246). The consent page is #241 (separate).

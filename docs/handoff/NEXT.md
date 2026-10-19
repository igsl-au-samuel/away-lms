# Handoff → Session 51: Build #241, the /oauth/consent page

**Model:** sonnet · **Effort:** high, plan mode (auth and UI). Branch from `feat/mcp-route` (PR #253, stacked on #252), or from `main` if those have merged.

## Goal
Issue #241 (`gh issue view 241`): the consent page Supabase redirects to for the OAuth flow (spec Decision 2, "Consent page").

## Done when
- Unit and integration tests as listed in the issue, written first.
- Signed-out visitors go to `/sign-in?next=<consent URL>`; sign-in honours `next` via `src/lib/safe-next.ts`.
- Page shows app name, redirect host, signed-in user and what the connector can do; Approve/Deny call Supabase's approve/deny-authorization APIs; inactive profiles get the "account not active" copy.
- Follows `docs/design/DIRECTION.md`.
- Lint, typecheck, `npm test`, `npm run test:integration`, `npm run build:worker` pass. Journal, then next-step. PR says `Closes #241`.

## Open first
- `docs/spec/REMOTE-MCP.md` Decision 2.
- `tests/integration/helpers.ts` `oauthTokenFor()`: it already drives `auth.oauth.getAuthorizationDetails` and `approveAuthorization`; copy that API usage.
- `src/lib/safe-next.ts`, the sign-in page and its action.

## Respect
- Local OAuth server is on (`supabase/config.toml`, `authorization_url_path = "/oauth/consent"`).
- `next build` OOMs on Sam's Windows machine at 15 workers. For `build:worker`, temporarily set `experimental.cpus: 2` in `next.config.ts` and don't commit it. `preview:worker` (workerd) also needs more free RAM than is usually available.
- Public repo: no secrets.

## Don't touch
`src/server/mcp/*` and the `/mcp` route (done in #242). Hosted Supabase and Cloudflare settings (Sam: #236, #245, #246).

## Still open from #242
Sam or CI should run `preview:worker` and POST `initialize` (not run locally), and check which AS metadata path hosted Supabase serves (#246).

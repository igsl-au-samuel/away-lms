# Handoff → Session 45: Plan for the remote LMS MCP server (#233)

**Model:** sonnet · **Effort:** high. This breaks an agreed spec into tasks and issues.

## Goal
Turn `docs/spec/REMOTE-MCP.md` into a plan with ordered tasks, tests (refusals first) and a
security checklist. Then create the build issues. Plan only; don't build.

## Do first: the checks in the spec's last section
- **Budget:** the Supabase OAuth server is on the Free plan, and the Workers rate-limiting binding
  is on Workers Free. **If either isn't free, stop and ask Sam.**
- The Claude connector callback URL(s), and whether a Client ID works without a secret.
- The SDK web-standard Streamable HTTP transport export (`@modelcontextprotocol/sdk` ^1.32).
- The supabase-js consent API names, and the claims in an OAuth access token (`client_id`, `iss`).
- JWKS or `getClaims`. Whether `preview_decision` needs a new RPC (if it does, it needs pgTAP).
Write the findings into the spec's last section (replace "To check").

## Done when
- The plan is in `docs/spec/REMOTE-MCP-PLAN.md`, with tasks, tests and a security checklist.
- Build issues are created in order. Label Sam-only steps `manual` (spec § "Manual steps").
  Ready issues get `status:ready`.
- ROADMAP Phase 4 is updated, and #233 is closed by the PR.

## Open first
`docs/spec/REMOTE-MCP.md`, `docs/decisions/0014-remote-mcp-supabase-oauth.md`,
`mcp/src/tools.ts`, `mcp/src/session.ts`, `specs/001-mvp/contracts/access-matrix.md`.

## Respect
- ADR 0014: Supabase OAuth, pre-registered client, `client_id` allowlist, preview tokens, and
  the route in the app Worker (gate: 3 MiB gzip).
- RLS and RPCs are the only authorization. No secret key in the MCP code path.
- Budget $0. Public repo: no secrets, no `.env*`. Never read `supabase/functions/.env`.

## Don't touch
- Hosted Supabase settings, Cloudflare variables, the OAuth client registration. Sam does those.
- PR for #232 (`docs/remote-mcp-spec`): Sam merges.

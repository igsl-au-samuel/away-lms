# Handoff → Session 44: Spec for the remote LMS MCP server (#232)

**Model:** opus · **Effort:** high, plan mode. Auth and public-endpoint design is judgment-heavy.

## Goal
Write `docs/spec/REMOTE-MCP.md` answering the questions in issue #232, then an ADR for the auth choice.
Spec only; do not build. Then plan (#233) in a later session.

## Decide in the spec
- Hosting: Cloudflare Workers, route in the Next.js app vs separate Worker (free tier only).
- Auth: OAuth through Supabase Auth vs demo token; threats of a public endpoint (token theft,
  scope, revocation, rate limits). RLS stays the real gate.
- Which tools from `docs/spec/MCP-TOOLS.md` to expose; write tools need confirmation (preview then confirm).

## Open first
`docs/spec/MCP-TOOLS.md`, `docs/decisions/0011-lms-mcp-local-stdio.md`, `/mcp` (local server code),
`specs/001-mvp/plan.md`, `docs/ROADMAP.md` Phase 4.

## Respect
- Budget $0; ask before adding any service or dependency with a cost.
- Public repo: no secrets, no `.env*`. Never read `supabase/functions/.env`.
- Authorization lives in Postgres (RLS + RPCs); new surface needs pgTAP-style refusal tests in the plan.

## Don't touch
- Hosted secrets, Vault entries, Cloudflare variables. Sam sets those.
- Open PRs #227 (deploy flag) and #234 (docs) belong to Sam to merge; human merge approval stays OFF until demo prep.

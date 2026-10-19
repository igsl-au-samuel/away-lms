# Handoff → Session 54: #247, remote MCP docs

**Model:** sonnet · **Effort:** medium. Branch `docs/remote-mcp` from `main`, after PRs #257 (#243) and #258 (#244) are merged.

## Goal
Issue #247 (`gh issue view 247`): document the remote MCP server for users and operators.

## Done when
- What #247 lists is written; README and `docs/DEMO.md` point at it.
- Lint, typecheck, `npm test` pass. PR says `Closes #247`. Journal, then next-step.

## Open first
- `docs/spec/REMOTE-MCP.md`, `docs/spec/REMOTE-MCP-PLAN.md`, ADR 0015.
- `tests/integration/mcp-remote.test.ts` (what is proven, by access-matrix row).
- `src/server/mcp/rate-limit.ts` (60 calls per minute per IP and per user).

## State
- #244 is PR #258, stacked on #257 (base `feat/rate-limit`). Retarget to `main` if #257 merges first. Merges: `gh pr view <n> --json baseRefName` first; `gh pr merge --merge`.
- `MCP_LIMITER` binding in `wrangler.jsonc`: Free plan acceptance is only known at first deploy. If Workers Builds rejects it, remove the `ratelimits` entry; the in-memory fallback stays.
- #246 (CPU time check, connecting Claude chat) is Sam's, blocked until #243 and #244 are merged and deployed.

## Respect
- `next build` OOMs on Sam's machine at 15 workers; docs need no build.
- Public repo: no secrets, no real client ids.

## Don't touch
Hosted Supabase and Cloudflare settings. The consent page and sign-in. Source under `src/`.

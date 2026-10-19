# Handoff → Session 53: Build #244, remote MCP integration tests

**Model:** sonnet · **Effort:** medium. Branch from `main` (`feat/mcp-remote-tests`) once the #243 PR (`feat/rate-limit`) is merged.

## Goal
Issue #244 (`gh issue view 244`): `tests/integration/mcp-remote.test.ts`, refusals first, then happy paths, against local Supabase with the OAuth server on.

## Done when
- Cases 1 to 9 in the issue, in order, then the happy paths and the `docs/DEMO.md` sequence.
- Case 9 (429 after 60 calls): pass `rateLimit: limiter(undefined)` in `handleMcpPost` deps with a `CF-Connecting-IP` header, or the user key.
- `npm run test:integration` passes; lint, typecheck, `npm test` pass. PR has a coverage note mapping each case to its access-matrix row, and says `Closes #244`. Journal, then next-step.

## Open first
- `tests/integration/mcp-tools.test.ts` (in-memory call helpers, `oauthTokenFor`).
- `src/server/mcp/handler.ts` (`McpDeps`: `makeClient`, `log`, `rateLimit`).
- `specs/001-mvp/contracts/access-matrix.md`, rows 13 to 20.

## State
- #243 landed as `feat/rate-limit`: `src/server/mcp/rate-limit.ts` (`limiter`, `LIMIT` 60, `rateLimited()`), per-IP check before verification (needs `CF-Connecting-IP`; absent means no IP check), per-user `sub:<sub>` after. `MCP_LIMITER` binding in `wrangler.jsonc`.
- Whether the Free plan accepts the binding is only known at the first real deploy. If Workers Builds rejects it, remove the `ratelimits` entry; the in-memory fallback stays.
- Merges: `gh pr view <n> --json baseRefName` first; merge commits (`gh pr merge --merge`).
- #246 (CPU time check, connecting Claude chat) is Sam's, blocked until #243 and #244 are merged and deployed.

## Respect
- `next build` OOMs on Sam's machine at 15 workers; this task needs no build.
- A `preview:worker` session may lock `.open-next`; ask Sam before stopping it.
- Public repo: no secrets.

## Don't touch
Hosted Supabase and Cloudflare settings. The consent page and sign-in.

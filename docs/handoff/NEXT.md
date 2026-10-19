# Handoff → Session 52: Build #243, rate limit on /mcp

**Model:** sonnet · **Effort:** medium. Branch from `feat/consent-page` (PR #254, stacked on #253 → #252), or from `main` if those have merged.

## Goal
Issue #243 (`gh issue view 243`): loose flood protection on `/mcp`, at $0. Spec threat model, "Flooding or cost".

## Done when
- Unit tests from the issue, written first: 61st call refused (binding and in-memory) · other key unaffected · window resets · undefined binding falls back · IP check runs before token verification · 429 has `Retry-After`.
- `src/server/mcp/rate-limit.ts`: `limiter(binding | undefined)` returns `check(key)`.
- `wrangler.jsonc` `ratelimits` entry `MCP_LIMITER` (limit 60, period 60). Check the installed Wrangler is 4.36 or later.
- Per-IP check (`ip:<CF-Connecting-IP>`) before verification, per-user check (`sub:<sub>`) after. Refusal is 429, `Retry-After`, no internals in the body.
- Document that it's a loose filter: limits are per location and eventually consistent.
- Lint, typecheck, `npm test`, `npm run test:integration` pass; `wrangler deploy --dry-run` accepts the config. If it rejects the binding on the Free plan, remove the entry, keep the fallback and say so in the PR. PR says `Closes #243`. Journal, then next-step.

## Open first
- `src/server/mcp/handler.ts` (the order of checks) and `tests/unit/mcp-route.test.ts` (how the handler is tested with fakes).
- `docs/spec/REMOTE-MCP.md`, threat model section.

## State of the stack and Sam's steps
- Open PRs: #252 (base `main`) → #253 (base `feat/oauth-bearer-auth`) → #254 (base `feat/mcp-route`). Merge in that order. "Delete branch on merge" is off, so before merging #253 and before merging #254 run `gh pr edit <n> --base main` and check the base, or the PR lands on a side branch (the #226 problem). Merges stay on auto (no human review on `main`, only the required checks) until demo prep.
- The remote MCP ADR is now `0015-remote-mcp-supabase-oauth.md` (renumbered in #254's branch). `0014` is the calendar-sync ADR.
- Sam finished #236 (hosted OAuth server) and #245 (client registered, Cloudflare Production secrets set). The Client ID is in `mcp/README.md`. #246 (preview check and connecting Claude chat) is blocked until #243, #244 and the stack are merged and deployed. Supabase sends people to the production Site URL for consent, so that check has to run on production, not a preview URL.
- Docs from the Supabase OAuth guide: the hosted discovery endpoint is `/.well-known/oauth-authorization-server/auth/v1` on the project URL. Check it against our protected-resource metadata when doing #246 (the open AS-metadata question).

## Respect
- `next build` runs out of memory on Sam's Windows machine at 15 workers. For `build:worker` or e2e, set `experimental.cpus: 2` in `next.config.ts` temporarily and don't commit it.
- A `preview:worker` session (workerd on :8787) may still be running and locks `.open-next`, so `build:worker` fails with EPERM. Ask Sam before stopping it.
- Local e2e needs `npm run seed:local` once (done on this machine) and the variables from `.env.local`.
- Public repo: no secrets.

## Don't touch
Hosted Supabase and Cloudflare settings (Sam: #246). The consent page and sign-in (done in #241).

## Still open
- #242: Sam or CI runs `preview:worker` and POSTs `initialize`; check which AS metadata path hosted Supabase serves (#246).
- #241: `build:worker` wasn't run locally (see above); CI should.

# Handoff → Session 48: Build #239, preview_decision and confirmation on writes

**Model:** sonnet · **Effort:** medium. Clear issue; tests listed.

## Goal
Issue #239 (`gh issue view 239`): wire `confirmation` into `src/server/mcp/tools.ts`, add `preview_decision`.

## Done when
- Unit tests first: fake client that fails if called; every bad token gives `confirmation_required` with zero RPC calls, for all three write tools.
- Integration tests per the issue (local Supabase, Docker must be running).
- Lint, typecheck, `npm test`, `npm run test:integration` pass.
- `mcp/README.md` and `docs/spec/MCP-TOOLS.md` updated. Journal, then next-step. PR says `Closes #239`.

## Open first
`src/server/mcp/confirmation.ts` (PR #249, #238; merge it first or branch from it), `src/server/mcp/tools.ts`, `src/lib/errors.ts`.

## Respect
- API: `signConfirmation({sub, tool, args}, secret)`, `verifyConfirmation(token, {sub, tool, args}, secret)` → `{ok}` or `{ok:false, reason}`. Both async.
- Bound arg names: `leave_type_id`, `start_date`, `end_date` (submit_leave); `request_id`, `outcome` (approve_request / decline_request). Map tool input onto these (resolve leave type name to id). Note and comment are not bound.
- No new RPC; `preview_decision` reads `approval_queue`.
- Public repo: no secrets or `.env*`.

## Don't touch
- Hosted Supabase and Cloudflare settings (Sam: #236, #245, #246).
- Sam's uncommitted docs in the main working tree (ROADMAP, spec, plan); leave unstaged.
- Note: a worktree at `D:\Work\lms-238` (branch `feat/confirmation-token`) exists; remove with `git worktree remove` after #249 merges.

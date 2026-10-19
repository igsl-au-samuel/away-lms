# Handoff → Session 47: Build #238, preview-token module

**Model:** sonnet · **Effort:** medium. Pure functions with a clear test list.

## Goal
Issue #238 (`gh issue view 238`): `src/server/mcp/confirmation.ts` with `signConfirmation` and
`verifyConfirmation` (HMAC-SHA256, WebCrypto only, 10 min expiry). Spec Decision 4.

## Done when
- `tests/unit/confirmation.test.ts` written first, refusals before the happy path (list is in the issue).
- Lint, typecheck and `npm test` pass. No `Buffer`, no `node:crypto`, no new dependency.
- Journal, then next-step. The PR says `Closes #238`.

## Open first
`docs/spec/REMOTE-MCP-PLAN.md` (Design notes), `src/server/mcp/tools.ts` (to see which args the
write tools take; don't edit it), `src/server/mcp/session.ts` (for the `atob` style).

## Respect
- Branch from `main` (PR #248 for #237 may still be open; the module doesn't depend on it).
- Bound args: submit = leave type id + start + end; approve/decline = request id + outcome. Note and comment are not bound.
- Secret under 32 chars throws. Constant-time compare via `crypto.subtle.verify`.
- Public repo: no secrets or `.env*`.

## Don't touch
- Tool behaviour: wiring `preview_decision` and `confirmation` is #239.
- Hosted Supabase and Cloudflare settings (Sam: #236, #245, #246).
- Sam's uncommitted docs on the working tree (ROADMAP, spec, plan); leave them unstaged.

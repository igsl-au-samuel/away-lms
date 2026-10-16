# Handoff → Session 11: Supabase keep-alive workflow (check issue via `gh issue list`)

**Model:** sonnet · **Effort:** medium

## State
PR #199 (T020/T021 Claude workflows) open. Needs Sam: `claude setup-token` → repo secret
`CLAUDE_CODE_OAUTH_TOKEN`, install the Claude GitHub App, merge. Workflows fail until then.

## Goal
Scheduled workflow pinging Supabase every 3 days so the free project isn't paused (ADR 0005).
Find its task/issue in `specs/001-mvp/tasks.md`. Depends on T017 (hosted Supabase, Sam's) —
if blocked, say so and pick the next unblocked Phase 1 task instead.

## Files to open
`specs/001-mvp/tasks.md` · `docs/decisions/0005-*.md` · `.github/workflows/ci.yml`

## Don't
Commit secrets (public repo). Touch Cloudflare or T017.

## Waiting on Sam
Merge #199 + secret/app; add `db` to branch protection (T022); T010/T011 Cloudflare; T017.

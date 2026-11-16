# Away — Leave Management System (AI-native SDLC demo)

Internal leave management tool for our team, built as a live demonstration of an
AI-native SDLC: spec → issues → agent builds → automated verification →
human-approved merge → deploy.

**How we work as a team (setup, branching, reviews, merging): `docs/TEAM.md`.**
Follow it; if this file and TEAM.md disagree, TEAM.md wins — flag it to the user.

**The repo is public.** Never commit secrets, API keys, `.env*` files or raw chat
transcripts (`docs/journey/raw/` is gitignored).

## Where things are
- Phase + task checklist: `docs/ROADMAP.md`
- Decisions: `docs/decisions/NNNN-title.md` (ADRs)
- Visual direction + tokens: `docs/design/DIRECTION.md` — follow it; don't invent colours/fonts.

## Stack (confirmed — ADRs 0005–0008)
Next.js 16 (TypeScript 6.0) on Cloudflare Workers Free via OpenNext · Supabase
(Postgres, Auth, RLS) · Brevo SMTP for auth emails · GitHub Actions CI ·
local Supabase in Docker · Google Calendar API · LMS MCP server
(TypeScript MCP SDK) in `/mcp`. Plan: `specs/001-mvp/plan.md`.
Authorization lives in Postgres (RLS + security definer RPCs); every policy has
pgTAP tests per `specs/001-mvp/contracts/access-matrix.md`.
Budget is $0 — free tiers only. Ask before adding any service or dependency with a cost.

## Roles
employee · manager · admin

## Rules for Claude
- Scope gate: open only the files the task needs; targeted grep/glob over folder sweeps.
- Plan mode for anything touching >3 files, the schema, or auth.
- Never push to `main`. Never merge a PR (`gh pr merge`, or merge via API) —
  merging is a human's job after review, per `docs/TEAM.md`.
- Never force-push a branch someone else is also working on.

## Definition of done (every task)
1. Lint, typecheck and tests pass.
2. Work is on a branch with an open PR that references its issue (`Closes #12`).
3. Run the `next-step` skill and show its block to the user.

## Git
Branch per task: `feat/…` `fix/…` `docs/…` `chore/…` · Conventional commits ·
PRs reference their issue · `main` is protected: changes land only through a
reviewed PR.

Personal workflow (journal, handoffs, next-step, model choice) goes in your own
gitignored `CLAUDE.local.md`, not here.

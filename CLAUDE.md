# Away — Leave Management System (AI-native SDLC demo)

Internal leave management tool for our team, built as a live demonstration of an
AI-native SDLC: spec → issues → agent builds → automated verification →
human-approved merge → deploy.

**The repo is public.** Never commit secrets, API keys, `.env*` files or raw chat
transcripts (`docs/journey/raw/` is gitignored).

## Where things are
- Phase + task checklist: `docs/ROADMAP.md`
- Brief for the current session: `docs/handoff/NEXT.md` — if it exists, read it FIRST.
- Journey log: `docs/journey/JOURNAL.md` (append-only)
- Decisions: `docs/decisions/NNNN-title.md` (ADRs)
- Visual direction + tokens: `docs/design/DIRECTION.md` — follow it; don't invent colours/fonts.

## Stack (tentative — confirmed in spec phase via ADR)
Next.js (TypeScript) on Vercel Hobby · Supabase (Postgres, Auth, RLS) ·
GitHub Actions CI · Google Calendar API (shared team calendar) ·
LMS MCP server (TypeScript MCP SDK) in `/mcp`.
Budget is $0 — free tiers only. Ask before adding any service or dependency with a cost.

## Roles
employee · manager · admin

## Working rules (token efficiency)
- Scope gate: open only the files the task needs. No "getting familiar" sweeps —
  check ROADMAP/handoff, or ask.
- Targeted search (grep/glob) over reading whole folders.
- One task per session where practical; long work gets a handoff, not a marathon.
- Plan mode for anything touching >3 files, the schema, or auth.
- Switching model mid-session re-reads the whole context uncached — prefer a fresh
  session with a handoff when the model changes.

## Definition of done (every task)
1. Lint, typecheck and tests pass (once they exist).
2. Run the `session-journal` skill.
3. Run the `next-step` skill and show its block to the user.

## Git
Branch per task: `feat/…` `fix/…` `docs/…` `chore/…` · Conventional commits ·
PRs reference their issue (`Closes #12`) · No direct pushes to `main` once branch
protection is on.

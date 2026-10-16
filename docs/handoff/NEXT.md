# Handoff → Session 10: Claude GitHub Action workflows (T020/T021, issues TBD)

**Model:** sonnet · **Effort:** medium

## State
PR #198 (T013–T016: pgTAP helpers, `health()` migration, CI `db` job) is green; Sam merges it
(auto-mode blocked agent self-merge). Journal PR `docs/journal-s09` is also open.
Local Supabase uses ports 553xx (Windows reserves 543xx). Docker Desktop works.

## Goal
T020 `.github/workflows/claude.yml` (`@claude` comment → branch + PR, collaborators only) and
T021 `claude-review.yml` (review comment on each PR). Auth via the existing Claude subscription
token as a secret. **Ask Sam before any paid API key.** Check each issue's Dependencies (`gh issue list`).

## Files to open
`specs/001-mvp/tasks.md` (T020–T021) · `.github/workflows/ci.yml` · ADR 0005–0008 as needed

## Decisions to respect
Budget $0. Never commit secrets (repo is public). Branch per task, Conventional Commits, `Closes #N`.

## Don't
T017 (hosted Supabase) is Sam's; T018/T019 wait on it. Don't touch Cloudflare.

## Waiting on Sam
Merge #198 + journal PR; add `db` to branch protection (then T022); T010/T011 Cloudflare; T017.

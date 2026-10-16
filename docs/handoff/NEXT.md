# Handoff → Session 06 (continued): create labels and issues

**Model:** sonnet · **Effort:** low · Everything is built; this is running a script after Sam's go.

## State
Prepared and committed on `docs/backlog` (PR #4): `.github/ISSUE_TEMPLATE/` (task.md,
config.yml), `scripts/backlog/` (labels.json, titles.tsv, demo-issues.json, sync.mjs).
PRs #1 → #2 → #3 → #4 are stacked (spec → plan → tasks → backlog). Nothing has been
created on GitHub yet except those PRs.

## Before you start
1. Check that PRs #1–#4 are merged (`gh pr list --state all`). If not, stop and ask Sam.
2. `git switch main && git pull`.

## Do
1. `node scripts/backlog/sync.mjs` (dry run). Expect issues to start at `highest + 1`
   (PRs take numbers: #5 onward) and 177 to create (168 MVP + 9 backlog).
2. Sam's go-ahead for the real run is already given for labels + issues once the stack is
   merged, but show the dry-run counts first and run `--apply labels --max 0`, then
   `--apply mvp,demo --max 3` as a pilot, check the 3 issues on GitHub, then the rest.
   Do not open issues or PRs while it runs (the script stops on a number mismatch).
3. Tick the ROADMAP Backlog line, then `session-journal` → `next-step`.

## Decided by Sam
- `status:ready`: T001 and T009 (computed: no blockers), plus backlog B4 (overlap warning,
  the demo issue) and B8 (CSV export, the spare).
- Dependencies are "Blocked by" lines from `T###` mentions in tasks.md plus the Phase 1
  chain; file-order ordering inside a phase is soft ("Merge order" for migrations only).
- T019 may edit `contracts/environment.md` via its own PR · `E2E_PASSWORD` stays test-only ·
  first hosted admin = dashboard user + one SQL insert (T090) · Claude Action uses the
  subscription OAuth token (T020/T021).

## Don't
- Don't implement tasks, link Cloudflare/Supabase, or touch the MCP work.
- Don't re-run `--apply` blindly after a failure: the script skips titles that exist, so
  re-running is safe, but check `gh issue list` first.

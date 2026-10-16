# Journey log

One entry per session, appended by the `session-journal` skill. Raw transcripts
(if kept) live in `docs/journey/raw/`, which is local only and gitignored.

## Session 01 — Feasibility review & foundations · 2026-10-16
- **Where:** Claude chat (cloud session linked to Sam's PC) · **Model/effort:** Opus / default
- **Goal:** Check the project is feasible at $0, list what's needed, and set up the project's working method.
- **Did:**
  - Reviewed the goals against the four SDLC layers (spec hub, context/MCP, execution, orchestration/verification).
  - Confirmed a free stack is viable; estimated 10–12 focused Claude Code sessions (~1–2 weeks within Pro limits).
  - Created project skills `next-step` (next task, model/effort, same vs fresh session) and `session-journal`.
  - Drafted CLAUDE.md, ROADMAP, design direction, handoff for session 02.
- **Decisions:** Combine the LMS build and the SDLC demo into one project · public repo · roles employee/manager/admin · internal audience and users · working name "Away" · draft "postcards from time off" visual direction · fresh project-specific skills (not reused from Little Sylly Games) · journal = summarised entries in repo, raw transcripts local-only.
- **Lessons:**
  - "Orchestration & automated verification" = CI/CD with agents plugged in: an issue triggers the agent, it opens a PR, CI and an AI review check it, a human approves the merge, then it deploys.
  - "MCP" means two things here: tools Claude uses while building (GitHub, Supabase, Calendar) vs the app exposing its own MCP server.
  - Claude chat queues and triggers work; Claude Code (local or in GitHub Actions) executes it.
  - The Chrome extension wasn't reachable from the cloud chat session, so account checks moved to CLI auth checks in Claude Code.
  - ccusage only sees Claude Code sessions, so chat sessions like this one must be noted manually.
- **AI vs human:** AI did the review, plan, skills and docs. Sam created accounts, enabled connectors, and made the scope/role/visibility decisions.
- **Effort:** ~30 min wall-clock · chat session (not tracked by ccusage)

## Session 02 — Repo + tooling setup · 2026-10-16
- **Where:** Claude Code (VS Code) · **Model/effort:** Opus 5.5 / low
- **Goal:** Make the folder a public GitHub repo, check the tooling, record a usage baseline, install the spec tooling.
- **Did:**
  - Moved the `next-step` and `session-journal` skills into `.claude/skills/`. First commit, then published https://github.com/igsl-au-samuel/away-lms (public).
  - Tooling check: git 2.53, node 24.15, gh 2.93 (authenticated as `igsl-au-samuel`).
  - Installed GitHub Spec Kit (uv 0.13.1 → specify-cli 0.12.11) and initialised it for Claude with sh scripts. Added `.specify/` and 10 `speckit-*` skills.
  - ccusage baseline (machine-wide, all projects, 36 days to 2026-10-16): 3.92B tokens · $1,873.95. This project so far today: ~0.77M tokens · $0.42.
- **Decisions:** Spec Kit instead of Superpowers ([ADR 0001](../decisions/0001-spec-kit-for-spec-driven-flow.md)) · commits as `samuel.tse@igsl-group.com` (repo-local config) · repo gets GitHub credentials from `gh`, so pushes go as the active gh account.
- **Lessons:**
  - Signing into VS Code doesn't log in the `gh` CLI, and Windows Credential Manager may still hold another account. Check `gh auth status` and git's credential helper before the first push.
  - The auto-mode safety check blocks creating a public repo without explicit human approval. That's a good human-in-the-loop point for the demo.
  - Superpowers was installed and then removed after a recheck of the session 01 notes. Choose the tooling before installing it.
  - winget installs don't update PATH in the running shell. Call the tool by its full path or start a new shell.
- **AI vs human:** AI ran checks, the commit, installs, Spec Kit setup and docs. Sam chose the GitHub account and commit email, ran `gh auth login` and `gh repo create`, and picked Spec Kit, winget and sh scripts.
- **Effort:** ~40 min wall-clock · context at end ~15% · PRs/issues: none

## Session 03 — Brainstorm, constitution & MVP spec · 2026-10-16
- **Where:** Claude Code (+ a parallel Claude chat session for visual direction, not visible to ccusage) · **Model/effort:** Opus 5.5 / high
- **Goal:** Settle the MVP with Sam and record it in Spec Kit; no app code.
- **Did:**
  - Short interview (8 questions), then `/speckit-constitution` → v1.0.0 with 7 principles (RLS-first is non-negotiable)
  - `/speckit-specify` + `/speckit-clarify` → `specs/001-mvp/spec.md`: 6 user stories and FR-001–032, with 7 clarifications recorded
  - Holiday regions per employee (QLD/Brisbane, NSW/Sydney, HK); the calendar shows all three
  - Backlog of 9 demo-sized items (half days, notifications, cancel, overlap warning, Calendar sync, ...)
  - Committed the chat session's "Ledger" design direction; ADR renumbered to 0002
- **Decisions:** email + password with admin invites, no public sign-up · calendar leave year · over-balance requests allowed and flagged · colleagues see name, dates and status only · uncapped leave types · allowance change log · one shared instance with a demo/real partition ([ADR 0003](../decisions/0003-shared-instance-demo-partition.md)) · `docs/spec/PRODUCT.md` dropped in favour of the spec · Ledger replaces Postcards ([ADR 0002](../decisions/0002-visual-direction-ledger.md))
- **Lessons:** Sam's answers repeatedly widened "MVP" into "build eventually". Spelling out core versus backlog-as-demo-issues made scoping click. A parallel chat session changed DIRECTION.md mid-session, and the first draft of the constitution had copied its tokens and gone stale. Principles should point at documents, not copy them. Two sessions both created an "0001" ADR, so numbering needs a check before writing.
- **AI vs human:** The agent drafted the questions, constitution, spec, edge cases and the demo-partition guardrails. Sam made every product call (regions, auth, over-balance, shared instance). The visual direction was decided in chat.
- **Effort:** ~45 min wall-clock · PRs/issues: none yet (branch `docs/mvp-spec`)

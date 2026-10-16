# Handoff → Session 02: Repo + tooling setup

**Model:** haiku or sonnet · **Effort:** low · Mechanical setup, no design decisions.

## Goal
Turn this folder into a git repo, publish it as a public GitHub repo, and confirm the
tooling works. Do not start any app code.

## Steps
0. Move the project skills into place: `setup/skills/next-step` and
   `setup/skills/session-journal` → `.claude/skills/`, then delete `setup/`.
   (The chat session couldn't write to `.claude` remotely.) Confirm both skills are listed.
1. Check: `git --version`, `node -v`, `gh --version`, `gh auth status`.
   If gh isn't logged in, run `gh auth login`. Sam completes the browser step.
2. `git init -b main`, then commit the existing scaffold
   (`chore: project scaffold, skills, roadmap`).
3. `gh repo create away-lms --public --source . --push --description "Away — leave management, built with an AI-native SDLC"`
4. Usage baseline: `npx ccusage@latest daily`. Paste the totals into this session's journal entry.
5. Install the Superpowers plugin (has the brainstorming skill). Follow the install
   instructions in its README at github.com/obra/superpowers. If it needs anything
   beyond a plugin command, stop and tell Sam.
6. Tick the Phase 0 items in `docs/ROADMAP.md`, commit, push.

## Don't
- Don't create a Next.js app, CI, labels or issues yet (Phases 1–2).
- Don't link Vercel/Supabase yet.

## Done when
The repo is live on GitHub with the scaffold, gh is authenticated, the ccusage
baseline is recorded, Superpowers is installed → run `session-journal` then `next-step`.
Expected next: **Session 03 — Brainstorm & spec** · opus · high · plan mode · FRESH session.

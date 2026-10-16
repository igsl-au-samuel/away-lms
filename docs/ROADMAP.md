# Roadmap

Rhythm inside every phase: Spec → Plan → Build → Verify → Document → Release.
The pipeline (Phase 2) is built *before* the app, so the app's own features go
through the AI-native flow. That's the demo story.

## Phase 0 — Foundations
- [x] Feasibility review + needs list (Claude chat)
- [x] Free accounts: GitHub, Vercel, Supabase, Google Cloud
- [x] Claude chat connectors enabled (GitHub, Google Calendar)
- [x] Project skills: `next-step`, `session-journal`
- [ ] Git repo + public GitHub repo, first commit
- [ ] Tooling check: git, gh auth, node; usage baseline via ccusage
- [ ] Install Superpowers plugin (brainstorming skill)

## Phase 1 — Spec
- [ ] Brainstorm: problem, users, MVP scope vs backlog
- [ ] Product spec → `docs/spec/PRODUCT.md`
- [ ] Design direction finalised → `docs/design/DIRECTION.md`
- [ ] Architecture + data model + ADRs (stack, auth/RLS, calendar approach)
- [ ] Backlog: issue template, labels, MVP issues + demo issues

## Phase 2 — Pipeline (orchestration + verification)
- [ ] App skeleton (Next.js + lint/typecheck/test) deployed to Vercel
- [ ] CI workflow: lint · typecheck · test · build on every PR
- [ ] Branch protection on `main` (checks must pass + human approval)
- [ ] Vercel preview deploy per PR
- [ ] Claude GitHub Action: `@claude` on an issue → branch + PR
- [ ] Claude PR review pass
- [ ] Dry run: one tiny issue end-to-end

## Phase 3 — Core app (MVP, via issues → PRs)
- [ ] Auth + roles (employee / manager / admin)
- [ ] Leave types + balances
- [ ] Request → approve/decline flow
- [ ] Team calendar view
- [ ] Admin settings + seed/demo data

## Phase 4 — Context layer (MCP + integrations)
- [ ] Supabase MCP wired into Claude Code (dev)
- [ ] Google Calendar sync on approval
- [ ] LMS MCP server (local, stdio) — query/submit/approve from Claude Code
- [ ] Stretch: remote LMS MCP for Claude chat

## Phase 5 — Demo readiness
- [ ] 3–5 `status:ready` demo issues queued
- [ ] Rehearse one autonomous run; record a backup
- [ ] Demo runbook (`docs/DEMO.md`)

## Phase 6 — Wrap-up
- [ ] Metrics: ccusage export, session count, hours, PRs
- [ ] Journey document (what we built, process, lessons learnt)
- [ ] Interactive HTML presentation

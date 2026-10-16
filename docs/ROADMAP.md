# Roadmap

Rhythm inside every phase: Spec → Plan → Build → Verify → Document → Release.
The pipeline (Phase 2) is built *before* the app, so the app's own features go
through the AI-native flow. That's the demo story.

## Phase 0 — Foundations
- [x] Feasibility review + needs list (Claude chat)
- [x] Free accounts: GitHub, Vercel, Supabase, Google Cloud
- [x] Free accounts for the confirmed stack: Cloudflare, Brevo (ADRs 0005, 0006) · Docker Desktop installed
- [x] Claude chat connectors enabled (GitHub, Google Calendar)
- [x] Project skills: `next-step`, `session-journal`
- [x] Git repo + public GitHub repo, first commit
- [x] Tooling check: git, gh auth, node; usage baseline via ccusage
- [x] Install GitHub Spec Kit (spec → plan → tasks flow), replacing Superpowers ([ADR 0001](decisions/0001-spec-kit-for-spec-driven-flow.md))

## Phase 1 — Spec
- [x] Brainstorm: problem, users, MVP scope vs backlog (interview → `/speckit-specify` → `/speckit-clarify`)
- [x] Constitution v1.0.0 → [`.specify/memory/constitution.md`](../.specify/memory/constitution.md)
- [x] MVP product spec → [`specs/001-mvp/spec.md`](../specs/001-mvp/spec.md) (replaces the planned `docs/spec/PRODUCT.md`; its Backlog section feeds demo issues)
- [x] Design direction finalised: "Ledger" → `docs/design/DIRECTION.md` ([ADR 0002](decisions/0002-visual-direction-ledger.md))
- [x] Architecture + data model + ADRs (stack, auth/RLS, demo data, holidays/timezones) → `/speckit-plan` → [`specs/001-mvp/plan.md`](../specs/001-mvp/plan.md) (ADRs 0004–0008)
- [x] Tasks → `/speckit-tasks` → `specs/001-mvp/tasks.md`
- [x] Backlog: issue template, labels, MVP issues (`/speckit-taskstoissues`) + demo issues from the spec's Backlog

## Phase 2 — Pipeline (orchestration + verification)
- [ ] App skeleton (Next.js + lint/typecheck/test) deployed to Cloudflare Workers (OpenNext)
- [x] CI workflow: lint · typecheck · test · build on every PR
- [ ] Branch protection on `main` (checks must pass + human approval)
- [ ] Cloudflare Workers Builds preview URL per PR
- [ ] Supabase keep-alive workflow (every 3 days, ADR 0005)
- [ ] Claude GitHub Action: `@claude` on an issue → branch + PR
- [ ] Claude PR review pass
- [ ] Dry run: one tiny issue end-to-end

## Phase 3 — Core app (MVP, via issues → PRs)
- [ ] Auth + roles (employee / manager / admin)
- [ ] Leave types + balances
- [ ] Request → approve/decline flow
- [ ] Team calendar view + holiday regions (QLD · NSW · HK) + profile
- [ ] Admin settings + seed/demo data (demo employees pad the real team, ADR 0004)

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

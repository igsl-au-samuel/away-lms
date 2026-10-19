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
- [x] App skeleton (Next.js + lint/typecheck/test) deployed to Cloudflare Workers (OpenNext)
- [x] CI workflow: lint · typecheck · test · build on every PR
- [x] Branch protection on `main`: required checks `lint`,`typecheck`,`unit`,`build`,`e2e`, no human approval (until demo prep; add `db` after T016)
- [x] Cloudflare Workers Builds preview URL per PR
- [x] Supabase keep-alive workflow (every 3 days, ADR 0005)
- [x] Claude GitHub Action: `@claude` on an issue → branch + PR (PR #199; needs secret + app)
- [x] Claude PR review pass (PR #199)
- [x] Dry run: one tiny issue end-to-end (#205 → PR #206)

## Phase 3 — Core app (MVP, via issues → PRs)
- [x] Auth + roles (employee / manager / admin)
- [x] Leave types + balances
- [x] Request → approve/decline flow
- [x] Team calendar view + holiday regions (QLD · NSW · HK) + profile
- [x] Admin settings + seed/demo data (demo employees pad the real team, ADR 0004)

## Phase 4 — Context layer (MCP + integrations)
- [x] Supabase MCP wired into Claude Code (dev) (ADR 0012)
- [x] Google Calendar sync on approval (planned: ADR 0013, `docs/spec/CALENDAR-SYNC.md`, #225)
- [x] LMS MCP server (local, stdio) — query/submit/approve from Claude Code (ADR 0011)
- [x] Google Calendar sync tested end to end by Sam (approval creates the event; test data cleaned up)
- [x] Remote LMS MCP spec (#232): `docs/spec/REMOTE-MCP.md`, ADR 0014 (Supabase OAuth 2.1, pre-registered client, route in the app Worker, preview tokens on writes)
- [x] Remote LMS MCP plan (#233): `docs/spec/REMOTE-MCP-PLAN.md`; free-tier checks done, build issues #236–#247
- [ ] Remote LMS MCP build (done: #237, #238, #239, #240, #242): #237 core move · #238 preview token · #239 tools · #240 OAuth + token checks · #241 consent page · #242 `/mcp` route · #243 rate limit · #244 integration tests · #247 docs
- [ ] Remote LMS MCP, Sam's steps: #236 hosted OAuth server · #245 register client + Cloudflare vars · #246 preview check and connect Claude chat

## Phase 5 — Demo readiness
- [ ] Turn human approval back on for `main` branch protection (at least one review, per T022) before the live demo
- [x] 3–5 `status:ready` demo issues queued (#176, #228–#231)
- [ ] Rehearse one autonomous run; record a backup
- [ ] Demo runbook (`docs/DEMO.md`)

## Phase 6 — Wrap-up
- [ ] Metrics: ccusage export, session count, hours, PRs
- [ ] Journey document (what we built, process, lessons learnt)
- [ ] Interactive HTML presentation

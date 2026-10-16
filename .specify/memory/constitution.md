<!--
Sync Impact Report (1.0.1, 2026-10-16)
- Version change: 1.0.0 → 1.0.1 (PATCH: stack wording only, no principle changed)
- Technology & Constraints: stack confirmed by ADR 0005 (Cloudflare Workers Free
  replaces Vercel Hobby); Principle I example list updated to match.
- Templates: no change. CLAUDE.md stack section updated to match.

Sync Impact Report (1.0.0)
- Version change: template → 1.0.0 (initial ratification)
- Principles defined:
  I. Zero-Cost Stack · II. Public-Repo Hygiene · III. RLS-First Security ·
  IV. Spec- and Issue-Driven Delivery · V. Automated Verification Gates ·
  VI. Design Direction Is Binding · VII. Small Slices, MVP First
- Added sections: Technology & Constraints · Development Workflow · Governance
- Removed sections: none
- Templates:
  ✅ .specify/templates/tasks-template.md — tests no longer "OPTIONAL" (Principle V)
  ✅ .specify/templates/plan-template.md — Constitution Check reads gates from this file; no change
  ✅ .specify/templates/spec-template.md — no mandatory-section change needed
  ✅ CLAUDE.md — already consistent (budget, public repo, git rules, design direction)
- Principle VI references DIRECTION.md ("Ledger", decided 2026-10-16) rather than copying
  its tokens, so the direction can change without amending this file.
- Deferred TODOs: none. Stack is tentative by design; confirmed by ADR at /speckit-plan.
-->

# Away Constitution

Away is an internal leave management tool for our team, built as a live demonstration
of an AI-native SDLC: spec → issues → agent builds → automated verification →
human-approved merge → deploy. The process is as much the product as the app.

## Core Principles

### I. Zero-Cost Stack

The budget is $0. Every service, hosting plan, API and dependency MUST be usable on a
free tier or be free/open source (e.g. Cloudflare Workers Free, Supabase Free, GitHub Actions free
minutes, Google Cloud free quota). Anything with a cost, or a free tier that requires a
payment method on file, MUST NOT be added without Sam's explicit approval, recorded in
an ADR. Designs MUST stay within free-tier limits (rows, auth emails, function
invocations, build minutes).

*Rationale:* the demo has to be reproducible by anyone, without a budget line.

### II. Public-Repo Hygiene

The repository is public. Secrets, API keys, service-role keys, `.env*` files, real
personal data and raw chat transcripts (`docs/journey/raw/`) MUST NOT be committed.
Configuration MUST come from environment variables, with a committed `.env.example`
that lists names only. Seed and demo data MUST be fictional.

*Rationale:* one leaked key compromises the live demo and the free accounts behind it.

### III. RLS-First Security (NON-NEGOTIABLE)

Authorization is enforced in the database. Every table in an exposed schema MUST have
Supabase Row Level Security enabled, with explicit policies per role (`employee`,
`manager`, `admin`). UI checks are convenience only, never the control. The
service-role key MUST NOT reach the browser. Every policy MUST have automated tests
that prove both allowed and denied access for each role.

*Rationale:* a leave tool holds personal data. If the database enforces access, an
AI-written UI bug cannot leak it.

### IV. Spec- and Issue-Driven Delivery

Every feature goes spec → plan → tasks → GitHub issue → pull request (Spec Kit, see
ADR 0001). Work happens on one branch per task (`feat/…`, `fix/…`, `docs/…`,
`chore/…`) with Conventional Commits. Each PR MUST reference its issue
(`Closes #N`). Once branch protection is on, nobody pushes directly to `main`, and
every merge needs a human approval.

*Rationale:* this traceable flow is what the demo shows. Agents propose, humans decide.

### V. Automated Verification Gates

Lint, typecheck, tests and a production build MUST pass in CI before a PR can merge.
Every change to behaviour MUST ship with tests that cover it (unit, integration or
RLS policy tests as appropriate). A failing or skipped check blocks the merge; it is
not waived in review.

*Rationale:* automated verification is what makes merging agent-written code safe.

### VI. Design Direction Is Binding

UI, docs and the presentation MUST follow `docs/design/DIRECTION.md`, currently the
"Ledger" direction (ADR 0002). It is the single source for colour tokens,
typography, spacing, icons and layout. Do not invent colours, fonts or one-off styles;
if something is missing, extend that document first. Status MUST never be conveyed by
colour alone (always a text label). Text MUST meet WCAG 2.1 AA contrast.

*Rationale:* the app, the docs and the presentation share one professional visual
system. Because principles point at the document instead of copying its values, a
change of direction does not need a constitution amendment.

### VII. Small Slices, MVP First

Build the MVP first. Everything else goes to the backlog as small, independently
shippable issues, ideally ones that can be built live in a demo. Each slice MUST
deliver user-visible value on its own and be testable in isolation. YAGNI: no
speculative abstractions, configuration or features without a spec line behind them.

*Rationale:* small slices keep agent runs short, reviews easy and demos reliable.

## Technology & Constraints

- **Stack (confirmed, ADR 0005):** Next.js (TypeScript) on Cloudflare Workers Free ·
  Supabase (Postgres, Auth, RLS) · GitHub Actions CI · Google Calendar API · LMS MCP
  server (TypeScript MCP SDK) in `/mcp`. Changes go through a new ADR, and specs
  still do not assume it.
- **Specs are technology-agnostic:** `spec.md` describes what and why. The how lives
  in `plan.md` and ADRs.
- **Roles:** `employee`, `manager`, `admin`. Any new role needs a spec change and new
  RLS policies.
- **Data:** keep only the personal data leave needs (name, work email, region,
  requests). No medical details in MVP.

## Development Workflow

- **Sessions:** one task per session where practical. Long work ends with a handoff in
  `docs/handoff/NEXT.md` rather than running on.
- **Plan mode:** use it for anything that touches more than 3 files, the schema or auth.
- **Journey:** every session appends to `docs/journey/JOURNAL.md` (the
  `session-journal` skill). Every real decision gets an ADR in `docs/decisions/`.
- **Definition of done:** checks pass → journal entry → `next-step` recommendation.
- **Reviews:** check compliance with this constitution during PR review and in the
  plan's Constitution Check. Any deviation MUST be justified in the plan's Complexity
  Tracking table.

## Governance

This constitution overrides other practices when they conflict. `CLAUDE.md` holds the
day-to-day operating guidance for agents and MUST stay consistent with it.

- **Amendments:** by PR on a `docs/…` branch, approved by Sam. The PR includes an
  updated Sync Impact Report and any template changes it requires.
- **Versioning:** semantic. MAJOR = a principle removed or redefined. MINOR = a
  principle or section added or materially expanded. PATCH = wording only.
- **Compliance:** every plan has a Constitution Check gate. Reviewers (human or agent)
  flag violations and do not wave them through.

**Version**: 1.0.1 | **Ratified**: 2026-10-16 | **Last Amended**: 2026-10-16

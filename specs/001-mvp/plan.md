# Implementation Plan: Away MVP — team leave management

**Branch**: `docs/mvp-plan` (stacked on `docs/mvp-spec`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-mvp/spec.md`

## Summary

Away replaces email requests and a balance spreadsheet for one small team across QLD,
NSW and HK. The MVP is a Next.js 16 web app on Cloudflare Workers Free (OpenNext)
with Supabase Free (Postgres, Auth). Authorization, working-day counting, balances
and request transitions all live in Postgres. RLS covers reads, and security definer
RPCs handle business writes and the privacy-preserving team calendar. pgTAP tests
cover every row of the access matrix. Accounts come only from admin invites (Brevo
SMTP). Demo data is a set of flagged fictional employees who pad the real team
(ADR 0004).

## Technical Context

**Language/Version**: TypeScript 6.0.x on Node 24 LTS. SQL (Postgres 17, Supabase)

**Primary Dependencies**: Next.js 16.4 (App Router, React 19, Server Actions),
`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.x, `@opennextjs/cloudflare` 1.20,
Wrangler 4, zod 4, Lucide icons, IBM Plex fonts (DIRECTION.md)

**Storage**: Supabase Postgres (schema in [data-model.md](data-model.md)), with SQL
migrations in `supabase/migrations/`

**Testing**: Vitest 5 (unit + integration), pgTAP via `supabase test db` (policies,
functions, counting), Playwright 1.64 (e2e smoke), `supabase db lint`

**Target Platform**: Cloudflare Workers (Node.js compat) and evergreen desktop and
mobile browsers

**Project Type**: Web application (one Next.js app plus a Supabase project)

**Performance Goals**: Request submitted in under 1 min (SC-001). Decision in under
30 s (SC-002). Calendar answer in under 10 s (SC-003). Pages render within the 10 ms
Worker CPU budget.

**Constraints**: $0 (all free tiers, no payment method on file). Public repo (no
secrets). Workers Free: 10 ms CPU, 100k requests a day. Supabase Free: 500 MB, pauses
after 7 days idle. Brevo: 300 emails a day. WCAG 2.1 AA.

**Scale/Scope**: 1 team, about 5–15 users plus demo employees. About 15 routes, 7
tables, about 15 RPCs. Two leave years of holidays for three regions.

All unknowns are resolved in [research.md](research.md) (R1–R12).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|-----------|------|--------------|-------------|
| I. Zero-Cost Stack | Every service is free with no card: Cloudflare Workers Free, Supabase Free, Brevo Free, GitHub Actions, Docker Desktop (personal) | ✅ | ✅ Brevo approved by Sam 2026-10-16 (ADR 0006). Free-tier limits designed for (ADR 0005, R11) |
| II. Public-Repo Hygiene | Env names only in `.env.example`. Secret key server-only. Demo passwords entered at run time. Fictional seed | ✅ | ✅ [environment.md](contracts/environment.md), R10 |
| III. RLS-First Security | RLS on every table. Per-role policies. Secret key never in the browser. Allowed and refused tests per policy | ✅ | ✅ [access-matrix.md](contracts/access-matrix.md) (25 rows + D1–D5), ADR 0007 |
| IV. Spec- and Issue-Driven | Spec → plan → tasks → issues → PRs. Branch per task | ✅ | ✅ This plan feeds `/speckit-tasks` |
| V. Automated Verification | Lint, typecheck, tests and build are CI gates. Tests ship with each behaviour change | ✅ | ✅ The gates are listed in [quickstart.md](quickstart.md) |
| VI. Design Direction | Follow DIRECTION.md. Status by label + icon | ✅ | ✅ [app-surface.md](contracts/app-surface.md) display rules |
| VII. Small Slices | MVP only. Backlog stays backlog | ✅ | ✅ No half-days, notifications or sync. Columns are sized (numeric days) only where it costs nothing |

**Result: PASS.** No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp/
├── spec.md              # Updated for ADR 0004 (demo = padding)
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── database-api.md  # RPCs, table access, error codes
│   ├── access-matrix.md # Policy test checklist (SC-005)
│   ├── app-surface.md   # Routes, Server Actions, display rules
│   └── environment.md   # Env var names and external settings
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/sign-in, forgot-password, set-password/
│   ├── auth/confirm/route.ts
│   ├── (app)/                 # session-guarded layout: sidebar / bottom tabs
│   │   ├── page.tsx           # dashboard
│   │   ├── requests/, requests/new/
│   │   ├── calendar/
│   │   ├── approvals/
│   │   ├── profile/
│   │   └── admin/users/, users/[id]/, leave-types/, holidays/, demo/
│   └── layout.tsx
├── actions/                   # Server Actions, one file per area
├── components/                # UI building blocks (badges, tables, calendar grid)
├── lib/
│   ├── dates.ts               # plain-date + Intl timezone helpers
│   ├── supabase/              # browser + server clients (@supabase/ssr)
│   └── schemas.ts             # zod input schemas
├── server/                    # import 'server-only'
│   ├── supabase-admin.ts      # secret-key client
│   └── demo/                  # fictional roster + loader (UI action + CLI)
└── proxy.ts                   # session refresh (fallback: middleware.ts, R3)

supabase/
├── config.toml                # enable_signup = false, local SMTP = Mailpit
├── migrations/                # schema, private helpers, RPCs, policies, seed
├── templates/                 # invite + recovery emails (token_hash links)
└── tests/                     # pgTAP: 00_helpers.sql, one file per area

tests/
├── unit/                      # Vitest
├── integration/               # Vitest against the local stack (🔑 actions, D4/D5)
└── e2e/                       # Playwright smoke (US1–US3)

scripts/                       # demo:load, seed:local (refuses non-local URL)
wrangler.jsonc · open-next.config.ts · .env.example
.github/workflows/             # ci.yml, keepalive.yml (Phase 2)
```

**Structure Decision**: a single Next.js app at the repo root, with the Supabase
project alongside it in `supabase/`. There's no separate backend, because the
database (RLS + RPCs) is the backend. `/mcp` stays reserved for Phase 4.

## Delivery slices (input for `/speckit-tasks`)

These map onto ROADMAP Phase 3. Each one can be shipped and tested on its own:

1. **Foundation:** schema, `private` helpers, reference seed, pgTAP helpers, and
   access-matrix rows 1–9 and 25.
2. **Auth + roles (US1 part):** sign-in, invite, set and reset password, deactivate,
   layout with role navigation.
3. **Balances (US1):** `get_balances`, dashboard, rows 20–24.
4. **Request (US2):** counting, preview, submit, my requests, rows 10–12, SC-004
   cases.
5. **Approve (US3):** decide, queue, rows 13–17.
6. **Calendar + profile (US4, US5):** `team_calendar`, month grid, profile, rows
   18–19.
7. **Admin + demo (US6):** admin screens, allowances and log, demo loader/disable,
   D1–D5.

The Phase 2 pipeline (skeleton on Workers, CI, previews, keep-alive) comes before
slice 1.

## Forward compatibility: LMS MCP server (Phase 4, not MVP)

The draft tools in [docs/spec/MCP-TOOLS.md](../../docs/spec/MCP-TOOLS.md) map onto the
RPCs in [database-api.md](contracts/database-api.md), with no extra MVP work. The MCP
server will call them with the user's own session, so RLS and the RPC checks apply
unchanged. `cancel_request` waits for spec Backlog item 3.

## Decisions recorded

- [ADR 0004](../../docs/decisions/0004-demo-employees-pad-real-team.md): demo
  employees pad the real team (supersedes 0003)
- [ADR 0005](../../docs/decisions/0005-stack-nextjs-cloudflare-supabase.md): stack:
  Next.js 16 on Cloudflare Workers + Supabase
- [ADR 0006](../../docs/decisions/0006-auth-invites-brevo-smtp.md): auth: invites,
  Brevo SMTP
- [ADR 0007](../../docs/decisions/0007-rls-model-and-policy-tests.md): RLS model and
  pgTAP tests
- [ADR 0008](../../docs/decisions/0008-holidays-working-days-timezones.md): holidays,
  counting, timezones

## Complexity Tracking

No Constitution Check violations.

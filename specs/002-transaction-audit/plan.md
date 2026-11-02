# Implementation Plan: Transaction audit log

**Branch**: `docs/spec-002-transaction-audit` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-transaction-audit/spec.md`

## Summary

One append-only table, `audit_log`, written by database triggers inside the same
transaction as each change (ADR 0016). Triggers on `leave_requests`, `allowance_overrides`,
`profiles` and `leave_types` cover every event in FR-002 for every route: web app, MCP
server and direct SQL. The actor comes from `auth.uid()`, with "System" when there is none.
Visibility is a single RLS select policy (admin all; others own plus default changes;
managers also the request and allowance entries for people they can decide). Existing
requests and allowance changes are backfilled idempotently, then `allowance_changes` is
retired in a second migration. The app gets a "My history" page and an admin Audit page with
a CSV export built in SQL to fit the Workers Free CPU limit. No balance maths changes.
Design decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.x on Node 24 LTS. SQL (Postgres 17, Supabase). As 001.

**Primary Dependencies**: Next.js 16 (App Router, Server Actions, route handler),
`@supabase/ssr`, `@supabase/supabase-js`, zod 4, Lucide icons. **No new dependency.**

**Storage**: Postgres (Supabase). New table `public.audit_log`; new `private` functions;
`allowance_changes` retired (research R8).

**Testing**: pgTAP (`npm run db:test`) for access, events and backfill; Vitest for helpers and
formatting; Vitest integration (`test:integration`) for demo load/reset/remove; Playwright for
the two pages; `npm run db:lint`.

**Target Platform**: Cloudflare Workers Free via OpenNext (web); local Supabase in Docker and
Supabase Free (data).

**Project Type**: Web application, with the database as the backend (as 001).

**Performance Goals**: Audit and My history lists open within 2 s at 50,000 entries. A
filtered export of up to 10,000 entries completes within 30 s (SC-008). Pages stay within the
10 ms Worker CPU budget (ADR 0005), so filtering, paging and CSV formatting happen in SQL.

**Constraints**: $0 (no new service). Public repo (no real data in seeds or tests; the 50k-row
seed is fictional and generated). Entries must never be editable by any role (FR-005).
Workers Free: about 50 subrequests per request, so one database call per page and per export.

**Scale/Scope**: Team of 5–15 plus demo users. Hundreds to a few thousand entries a year. Free
database limit (500 MB) is not a concern; revisit archiving only if it nears.

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1.*

| Principle | Status | How |
|-----------|--------|-----|
| I Zero-cost stack | Pass | No new service or dependency. One table, SQL functions. |
| II Public-repo hygiene | Pass | No secrets. Audit values hold explicit field lists, never emails or auth data (FR-007). Test data is fictional. |
| III RLS-first (non-negotiable) | Pass | RLS on; single select policy; no write grants; immutability trigger. Rows 28–42 each have an allowed and a refused test. Read functions are `security invoker` so RLS still applies. |
| IV Spec- and issue-driven | Pass | spec → this plan → tasks → issues → PRs. ADR 0016 accepted. FR-020 and FR-015 amended for managers (see below). |
| V Automated verification | Pass | pgTAP, Vitest, Playwright, lint, typecheck, build in CI. Existing suite must pass unchanged (SC-009). |
| VI Design direction | Pass | Both pages follow `docs/design/DIRECTION.md`. Action text labels, never colour alone (FR-028). No invented tokens. |
| VII Small slices | Pass | Four independently shippable slices, below. No generic audit framework beyond the four tables. |

No violations. Complexity Tracking is empty.

**Spec amendments made during planning (with Sam, 2026-11-02):**

- FR-020 and FR-015: a manager also sees `allowance` entries for people they can decide for,
  so the Approvals page's allowance panel keeps working. Without this the panel would go
  empty (001 access-matrix row 23 let managers see all).
- Confirmed: default-allowance changes are visible to every signed-in user; other
  leave-type changes are admin-only. Demo entries stay, labelled; demo cascades write no
  events.

## Project Structure

### Documentation (this feature)

```text
specs/002-transaction-audit/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── access-matrix.md   # rows 28–42, event-by-route cases, D6–D9
│   └── database-api.md    # audit_search, audit_my_history, audit_export_csv
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source code (repository root)

```text
supabase/
├── migrations/
│   ├── <ts>_audit_log.sql              # A1: table, indexes, grants, policy, immutability triggers
│   ├── <ts>_audit_triggers.sql         # A2: private.audit_* functions and the four table triggers
│   ├── <ts>_audit_backfill.sql         # A3: private.audit_backfill() and one call
│   ├── <ts>_audit_allowance_swap.sql   # A4: new admin_set_allowance; drop leave_types_log_default
│   ├── <ts>_audit_reads.sql            # A5: audit_my_history, audit_search, audit_export_csv
│   └── <ts>_drop_allowance_changes.sql # B: separate PR, after production check
└── tests/
    ├── row28_..._row42_*.sql           # access matrix rows
    ├── audit_events_*.sql              # event by route (RPC, direct SQL, secret key)
    ├── audit_backfill.sql
    └── audit_csv.sql

src/
├── app/(app)/history/page.tsx          # My history
├── app/(app)/admin/audit/page.tsx      # Audit page, filters in URL query
├── app/(app)/admin/audit/export/route.ts   # GET, calls audit_export_csv
├── server/audit.ts                     # filter parsing (zod), data calls, formatting helpers
├── components/audit/                   # entry list, filter bar, empty and error states
├── app/(app)/page.tsx                  # switched to audit_log (R8)
├── app/(app)/approvals/page.tsx        # switched to audit_log (R8)
├── app/(app)/admin/users/[id]/page.tsx # switched to audit_log (R8)
└── lib/database.types.ts               # regenerated

tests/
├── unit/                               # audit formatting, filter parsing
├── integration/demo-reset.test.ts      # extended (D7)
└── e2e/audit.spec.ts                   # new

scripts/seed-audit-volume.ts            # fictional 50k-row seed for the timing check
docs/decisions/0016-…                   # accepted
```

**Structure Decision**: Same single Next.js app plus `supabase/` as 001. The database is the
backend; pages only call SQL functions through the user's session. No new top-level folder,
and `/mcp` is unchanged (the MCP server already acts as the user, so its writes are audited
with no code change).

## Phase 0 and Phase 1 outputs

- [research.md](research.md): actor (R1), reason (R2), events (R3), table (R4), append-only
  (R5), visibility (R6), backfill (R7), retirement (R8), manager query and My history (R9),
  CSV export (R10), other (R11).
- [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Delivery slices (input to `/speckit-tasks`)

Each is a PR that leaves `main` green and ships value alone (Constitution VII).

1. **Record it (US1, P1).** Migrations A1–A3: table, grants, policy, immutability, actor,
   triggers. pgTAP rows 28–40 and event tests. `admin_set_allowance` and the old
   `leave_types_log_default` trigger are left alone in this slice, so `allowance_changes`
   keeps being written and the three existing panels keep working. Allowance changes are
   then recorded twice (old log and audit log) until slice 2.
2. **Carry over and retire (US4, P4).** A4 backfill, the `admin_set_allowance` swap and
   dropping `leave_types_log_default` (both moved here from slice 1 so the old log stops
   only when its readers switch), switching the three readers to `audit_log`, then
   migration B in a later PR after the production count check (R8).
3. **My history (US2, P2).** A5 `audit_my_history`, `/history`, nav link, e2e.
4. **Audit page and export (US3, P3).** `audit_search`, `audit_export_csv`, `/admin/audit`,
   route handler, CSV tests, 50k-row timing check.

Open items for `/speckit-tasks`: whether slices 1 and 2 merge into one PR (decide on diff
size); the exact nav placement for My history (DIRECTION.md); a short ADR if the 50k timing
check forces the inline-policy fallback in R6.

## Complexity Tracking

None.

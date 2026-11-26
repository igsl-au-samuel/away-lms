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
- [x] Branch protection on `main` (checked against GitHub on 2026-11-17): a pull request is required, with 0 approving reviews, so the human review stays our guideline (`docs/TEAM.md` §1) — it is not a GitHub rule. The six checks `lint`,`typecheck`,`unit`,`build`,`e2e`,`db` are required and bind admins (`enforce_admins` on), squash-merge only, head branches deleted on merge. `strict` ("require branches to be up to date") is off on purpose, so a green PR does not re-run when `main` moves: re-check CI before merging one that has gone stale. #352 tracks what is still not automated.
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
- [x] Remote LMS MCP spec (#232): `docs/spec/REMOTE-MCP.md`, ADR 0015 (Supabase OAuth 2.1, pre-registered client, route in the app Worker, preview tokens on writes)
- [x] Remote LMS MCP plan (#233): `docs/spec/REMOTE-MCP-PLAN.md`; free-tier checks done, build issues #236–#247
- [x] Remote LMS MCP build (done: #237–#244, #247): #237 core move · #238 preview token · #239 tools · #240 OAuth + token checks · #241 consent page · #242 `/mcp` route · #243 rate limit · #244 integration tests · #247 docs
- [x] Remote LMS MCP, Sam's steps (done: #236, #245, #246): #236 hosted OAuth server · #245 register client + Cloudflare vars · #246 preview check and connect Claude chat (demo ran; step 6: connector disconnected, demo logins deliberately left on for testing, switch off or change the demo password before real colleagues start)
- [x] Remote LMS MCP CPU: accepted by Sam (no Workers Paid). 24 of 26 real-token requests exceeded 10 ms (median 34.5 ms); baseline 405/401/429 are 2 to 4 ms; cause is first-use work per fresh isolate. See `docs/spec/REMOTE-MCP.md`
- [ ] Read the temporary `[mcp-timing]` logs in Observability (compare cpuTimeMs by `seq`), then remove them from `src/server/mcp/handler.ts` (Sam reads, agent removes)
- [ ] One week after team use starts: check the Observability Errors card and any non-ok outcome such as `exceededCpu` for `/mcp`
- [ ] Before real colleagues start using the app: switch demo logins off or change the demo password (left on for testing, deviates from ADR 0004; journal Session 57)

## Phase 5 — Demo readiness
- [ ] Turn human approval back on for `main` branch protection (at least one review, per T022) before the live demo
- [ ] Rehearse the remote MCP demo with Claude chat before the live demo (CPU overrun accepted, so check it still connects and responds)
- [x] 3–5 `status:ready` demo issues queued (#176, #228–#231) — read 2026-11-26: #228 and #229
  shipped the same day (`7060350`, `57971e4`), #230 and #231 are closed, and **#176** (the overlap
  warning an approver needs before deciding) is the only one of the five still open.
- [ ] Rehearse one autonomous run; record a backup
- [ ] Demo runbook (`docs/DEMO.md`)

## Phase 6 — Wrap-up
- [x] Metrics: ccusage export, session count, hours, PRs → [`journey/METRICS.md`](journey/METRICS.md) (chat sessions and Action runs are a stated gap)
- [x] Journey document (what we built, process, lessons learnt) → [`journey/JOURNEY.md`](journey/JOURNEY.md), with a plain-language concept map in [`journey/CONCEPTS.md`](journey/CONCEPTS.md)
- [x] Interactive HTML presentation → [`presentation/index.html`](presentation/index.html) (open in a browser; N for speaker notes)
- [ ] After the demo: fill the "Live demo" chapter in the journey and the live demo slide (run time, what broke, how it was handled)

## Feature 002 — Transaction audit

The second feature, specced while the demo work was still open: one append-only record
of who changed what, when, with before/after values and a comment, written by the
database itself so no route, tool or admin can skip it
([spec](../specs/002-transaction-audit/spec.md), [ADR 0017](decisions/0017-audit-by-triggers-append-only.md)).
Spec, plan and the 82 tasks came in #351. It ships in four independently shippable
slices plus a separate retirement migration — one PR per slice, and each line below
ticks when its PR merges. Three agent sessions work the backlog at once; ownership, the
single-migration queue and the shared local stack are coordinated in #361.

- [x] **Slice 1 — record it** (A001–A033): the `audit_log` table, its grants and
  policy, immutability, the actor snapshot, and triggers on `profiles`,
  `leave_requests`, `allowance_overrides` and `leave_types`; pgTAP rows 28–40. → #354,
  merged as `ad5daa7`. Slice 1 wrote an allowance change twice — into `allowance_changes`
  and into `audit_log` — and stopped doing that with slice 2's A039; the old table is
  frozen, not dropped, until slice 2b.
- [x] **Slice 2 — carry over and retire** (A034–A044, issues #299–#309): backfill the
  past requests and allowance changes, have `admin_set_allowance` write the audit reason
  and stop touching `allowance_changes`, drop the `leave_types_log_default` trigger, and
  point the three allowance panels at `audit_log`. → #371, #373, #378, #379, #386, #389,
  #390, closed out by #400. There was never one slice PR: A044 asked for a single
  "slice 2" pull request and the work arrived as seven, because A039 measured on CI as
  unable to land without its three readers. A044's sweep was read off CI rather than run
  on a laptop, for the reason its own line in
  [tasks.md](../specs/002-transaction-audit/tasks.md) gives — `db:reset` drops the one
  Postgres container all three build sessions share. What is built is
  `git log --oneline origin/main` and what is ticked is that file; since #400 they agree
  for every line through A044.
- [x] **Slice 2b — retire `allowance_changes`** (migration B, A045–A050, issues
  #310–#315): gated on A045, the row-count check Sam runs against production. The drop
  does not move until the `allowance_changes` rows and the backfilled `ac:%` entries are
  accounted for — equal on a database that got both slices in one push, and this one did
  not, so [tasks.md decision 10](../specs/002-transaction-audit/tasks.md) and the query at
  the end of [quickstart step 4](../specs/002-transaction-audit/quickstart.md) say what the
  difference is allowed to be made of. For the rows inside that window the table is the only
  copy of their reason text, so A046 deletes it. *Ticked 2026-11-26, measured rather than
  assumed: A045–A050 are ticked in
  [tasks.md](../specs/002-transaction-audit/tasks.md), the drop is on `main` as
  `20261118020000_drop_allowance_changes.sql`, and not one of #310–#315 is still open.*
- [x] **Slice 3 — my history** (A051–A062, issues #316–#327): `audit_my_history`, the
  `/history` page, its nav link and the e2e specs. *Ticked 2026-11-26: A051–A062 are all
  ticked, the function ships as `20261117140000_audit_my_history.sql`, `src/app/(app)/history/page.tsx`
  exists and is reached by a `<Link href="/history">My history</Link>` in the allowance-changes
  card on the dashboard (`src/app/(app)/page.tsx`, not from the tab bar — the bar is full, see
  #423), `/history` is in the a11y sweep for all three roles
  (`tests/e2e/a11y.spec.ts:27,29,32`) while `tests/e2e/mobile.spec.ts` measures `/`,
  `/approvals`, `/calendar`, `/requests/new` and the admin pages at phone widths and never
  `/history`, and no issue in #316–#327 is open. What the page *content* does have is real:
  `tests/e2e/audit.spec.ts:121-189` asserts an
  employee sees their own entry and not a colleague's, that the colleague sees it on their own
  page (so the zero-count above cannot be an empty page), that a manager sees a decidable
  submission, and that a bad cursor shows the error state and the retry link clears it.*
- [ ] **Slice 4 — audit page and export** (A063–A077, issues #328–#342):
  `audit_search`, `audit_export_csv`, `/admin/audit`, the CSV tests and the 50k-row
  timing check. *Measured 2026-11-26, and the box stays unticked honestly: the page and both
  functions are on `main` (`20261118030000_audit_search_export.sql`, `06a1016` for the CSV
  download, `00c0477` for the page inside the a11y sweep), but A068 has nothing to run —
  `scripts/seed-audit-volume.ts` does not exist and `package.json` has no `seed:audit-volume`
  script — and A075, the 50k timing check, is gated on exactly that seed. Of the eight
  issues still open in the range (#331 #332 #333 #335 #336 #337 #340 #342), five are mirrors
  of ticked tasks (#331 #332 #335 #336 #337 → A066 A067 A070 A071 A072) and three are the
  open boxes themselves.*
- [ ] **Polish** (A078–A082, issues #343–#347): this section, the
  migrations-that-rewrite-audited-tables note, the quickstart walk, the public-repo
  secret grep and the Definition-of-Done sweeps. Three of the five are done and ticked in
  [tasks.md](../specs/002-transaction-audit/tasks.md) — #343, #344 and #345 closed with
  their PRs. Two stay open, and neither is work left undone. #346 is A081: its diff sweep
  merged as **#412** (`e70838b`, 2026-11-17) and the tip is clean for personal addresses, keys
  and real names — `git grep -cE "[A-Za-z0-9._%+-]+@gmail\\.[a-z]+" origin/main -- .` answers 0,
  and the one file still matching a domain is the repo-local work address, left in on purpose —
  so the box is open for one human decision — two ancestor commits still carry a
  personal address in their diffs and clearing them means rewriting `main` — plus one half
  that has nothing to run against yet, because `scripts/seed-audit-volume.ts` is A068 in
  slice 4 and does not exist on `main`. #347 is A082: its lint/typecheck/test sweep is
  complete and CI enforces it on every merge, and its two skill steps are open because this
  runtime does not load `.claude/skills`, the directory where both skills are committed — a
  runtime gap, not an unmet definition of done.


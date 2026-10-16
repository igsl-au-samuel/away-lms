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

## Session 04 — MVP plan: architecture, data model, ADRs · 2026-10-16
- **Where:** Claude Code (VS Code) · **Model/effort:** Opus 5.5 / high
- **Goal:** Run `/speckit-plan` for `specs/001-mvp` and record the stack, auth, RLS and holiday decisions.
- **Did:**
  - Plan, research (R1–R12), data model (7 tables, enums, constraints), 4 contracts (DB API, access matrix, app surface, env) and quickstart, all on `docs/mvp-plan` (stacked on the unmerged `docs/mvp-spec`).
  - Constitution Check passes before and after design. Constitution 1.0.1 (stack wording), CLAUDE.md stack, and ROADMAP architecture line ticked.
  - The access matrix (25 rows + 5 demo cases) is the pgTAP checklist for SC-005.
- **Decisions:** [0004](../decisions/0004-demo-employees-pad-real-team.md) demo employees pad the real team (supersedes 0003, spec FR-029–032 rewritten) · [0005](../decisions/0005-stack-nextjs-cloudflare-supabase.md) Next.js 16 on Cloudflare Workers Free + Supabase, TS 6.0 · [0006](../decisions/0006-auth-invites-brevo-smtp.md) admin invites, Brevo SMTP · [0007](../decisions/0007-rls-model-and-policy-tests.md) RLS + security definer RPCs, pgTAP · [0008](../decisions/0008-holidays-working-days-timezones.md) holiday seed, counting in Postgres, timezones
- **Lessons:**
  - Checking the free-tier terms found that Vercel Hobby is non-commercial only, which is a real risk for a work tool. "Free" also has to mean "allowed".
  - Asking what the demo data is *for* removed a whole partition layer from RLS. That question belonged in the spec session.
  - Latest isn't always compatible: TypeScript 7 is out, but typescript-eslint caps at <6.1.
- **AI vs human:** The agent researched, designed and wrote all the artifacts. Sam chose Brevo, Docker locally, demo-as-padding and Cloudflare over Vercel.
- **Effort:** ~45 min wall-clock · context at end ~15% · PRs/issues: none yet (branch pushed, no PR)
- **Session 04 addendum:** Sam's drafts `docs/DEMO.md` and `docs/spec/MCP-TOOLS.md` were meant as inputs to Session 03 but arrived after the plan. They've been reconciled now: the demo script follows ADR 0004 and Cloudflare, its live-build example moved to a backlog item (holidays are MVP), and the MCP tools map onto the planned RPCs. `cancel_request` waits for Backlog item 3. Cloudflare and Brevo accounts are created and Docker Desktop is installed. **Lesson:** drafts made in Claude chat need committing before the session that uses them, or they get missed.

## Session 05 — MVP tasks · 2026-10-16
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high
- **Goal:** `/speckit-tasks` for `specs/001-mvp`, then `/speckit-analyze` and fix CRITICAL/HIGH findings.
- **Did:**
  - `specs/001-mvp/tasks.md`: 168 issue-sized tasks in 9 phases. Phase 1 is the pipeline (skeleton on Workers, CI, previews, DB pipeline with `health()`, keep-alive, Claude workflows, branch protection, dry run). Phase 2 is the foundation, then US1–US6 and polish.
  - Every access-matrix row and D1–D5 has its own test task, written before the code it tests (coverage table in the file). Manual steps for Sam are tagged 🧑.
  - Analysis found 0 CRITICAL and 3 HIGH, all fixed in tasks.md: CI/preview builds lacked `NEXT_PUBLIC_*` values; `seed:local` and the demo loader had no admin session for `admin_create_profile` / decisions; Server Actions and `server-only` modules couldn't be tested under Vitest.
- **Decisions:** none needing an ADR. Branched `docs/mvp-tasks` off `docs/mvp-plan` (neither earlier branch is merged).
- **Lessons:** A walking-skeleton `health()` RPC lets the DB pipeline (CI, migration deploy, keep-alive) be proven before the schema exists. Reading each RPC's caller identity against who invokes it (CLI, seed, UI) caught gaps the contracts hid.
- **AI vs human:** Agent wrote and checked tasks. Left for Sam: items below under "Open for Sam".
- **Open for Sam:** (1) T019 adds the keep-alive variable names to `contracts/environment.md`, a contract change. (2) `E2E_PASSWORD` is a test-only env var outside that contract. (3) The plan has no first-admin bootstrap for the hosted project, so T090 adds `docs/ops/BOOTSTRAP.md`. (4) T020/T021 must use the Claude subscription token, not a paid API key.
- **Effort:** ~40 min wall-clock · PRs/issues: none yet

## Session 06 — Backlog: issue template, labels, issues · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high
- **Goal:** Last two Phase 1 ROADMAP items: issue template and labels, then the MVP and demo issues.
- **Did:**
  - `.github/ISSUE_TEMPLATE/task.md` (goal, acceptance criteria, files, out of scope, dependencies) and 18 labels: phase, story, `manual`, `status:ready`, `backlog`.
  - `scripts/backlog/sync.mjs` generates issues from `tasks.md` and nine hand-written backlog items. Dry run by default, skips titles that exist, and stops if GitHub returns an unexpected number, so `#N` cross-references are exact.
  - Merged the stacked docs PRs #1–#4 in order. Piloted 3 issues, then created all 177: #5–#172 are T001–T168 and #173–#181 are the backlog. `status:ready` on T001, T009 and the demo pair (overlap warning, CSV export).
- **Decisions:** merge the stack before creating issues so links and the template resolve on `main` · "Blocked by" comes from `T###` mentions plus the Phase 1 chain, with ordering inside a phase left soft · `status:ready` means unblocked and fully specified. No ADR needed.
- **Lessons:** `tasks.md` has no short titles, so a hand-written `titles.tsv` was needed for readable issue titles. Predicting issue numbers up front, with a check on each create, avoided a second pass to rewrite references. The script took about 10 minutes for 174 issues because `gh` calls are slow, so run it in the background.
- **AI vs human:** The agent built the template, script, titles and backlog bodies and ran the creation. Sam answered two questions (merge in PRs, which backlog issues are ready) and delegated the merges.
- **Effort:** ~50 min wall-clock · PRs/issues: PRs #1–#4 merged, issues #5–#181 created

## Session 07 — Scaffold the app (T001) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet 5.5 / low
- **Goal:** Issue #5 — Next.js 16 App Router skeleton at the repo root.
- **Did:**
  - Hand-wrote package.json (engines pinned to Node 24), next.config.ts, src/app/layout.tsx, placeholder page.tsx; `next build` generated tsconfig.json.
  - `npm run build` passes. PR #183 opened with `Closes #5`.
  - Added `next-env.d.ts` to .gitignore.
- **Decisions:** none. Skipped plan mode: the file list was fixed by the issue.
- **Lessons:** Writing files by hand avoided create-next-app clobbering CLAUDE.md/docs. Next generated tsconfig with `strict: false`, so tighten it when ESLint/typecheck lands (#6).
- **AI vs human:** Agent did all of it; Sam still needs to review and merge.
- **Effort:** ~10 min wall-clock · PRs/issues: #183, #5

## Session 07b — Pipeline skeleton, T002–T009 · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet 5.5 / medium
- **Goal:** Work through the unblocked Phase 2 issues: #13, #6, #7, #8, #9, #10, #11, #12.
- **Did:**
  - Merged PRs #183–#192: PR template, ESLint + strict TS, Vitest, Playwright, `.env.example`, OpenNext + Wrangler, pass-through `src/proxy.ts`, CI workflow.
  - R3 answered: Node `proxy.ts` builds with OpenNext and serves locally (200/404); no edge `middleware.ts` fallback needed. Noted in research.md.
  - CI (lint, typecheck, unit, build:worker, e2e) was green on its first run.
- **Decisions:** Sam: merge PRs without waiting for review until the planned demo. No ADR.
- **Lessons:**
  - `incremental` made `tsc` write `tsconfig.tsbuildinfo`, which slipped into #185 (fixed in #186). Check `git status` before committing, not after.
  - OpenNext warns that Node middleware is experimental and Windows is shaky; the first real preview (T010/T011) is the true test.
  - `npm audit` reports 4 high advisories in a build-time `glob` dependency of the adapter; left alone, not reachable at runtime.
- **AI vs human:** Agent built and merged everything. Remaining items need Sam: T010/T011 (Cloudflare Workers Builds) and branch protection.
- **Effort:** ~45 min wall-clock · PRs/issues: #183–#192, #5–#13

## Session 08 — Supabase CLI init (T012) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Issue #16 (T012): init Supabase CLI, disable signup, add db scripts.
- **Did:**
  - Pinned `supabase` 2.121.0 as a devDependency, ran `supabase init`, added `db:start|reset|test|lint` scripts.
  - Set `enable_signup = false` in both `[auth]` and `[auth.email]`; local mail left on (`[local_smtp]`, Mailpit).
  - PR #195 merged by the agent after lint/typecheck/unit/build/e2e passed.
- **Decisions:** none (plan mode skipped: config only, no schema or policies).
- **Lessons:**
  - Docker is not installed on this machine, so `db:start`/`db:test` were never run locally. T013–T016 (pgTAP, fail-then-pass `health()` test) need it, so I stopped after T012 rather than write unverifiable tests.
  - `[auth]` and `[auth.email]` each have their own `enable_signup`; setting only one leaves email signup open.
- **AI vs human:** Agent did all of it. Sam needs to install and start Docker Desktop before #17–#20.
- **Effort:** ~15 min wall-clock · PRs/issues: #195, #16

## Session 10 — Claude GitHub Action workflows · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** T020 `claude.yml` (@claude → branch + PR) and T021 `claude-review.yml` (review on each PR).
- **Did:**
  - `claude.yml`: triggers on issue/PR comments, reviews and new issues; gated to OWNER/MEMBER/COLLABORATOR via `author_association`.
  - `claude-review.yml`: one review comment per non-draft same-repo PR; fork PRs skipped (no secrets, public repo).
  - Both authenticate with `CLAUDE_CODE_OAUTH_TOKEN` (subscription token), no paid API key. PR #199 (closes #24, #25).
- **Decisions:** none (subscription token per T020; no ADR needed).
- **Lessons:** Workflows can't be tested until the secret and Claude GitHub App exist, so the PR's green CI says nothing about them; T023 dry run is the real test.
- **AI vs human:** Agent wrote and opened the PR. Sam must run `claude setup-token`, add the repo secret, install the Claude GitHub App, and merge.
- **Effort:** ~10 min wall-clock · PRs/issues: #199, #24, #25

## Session 12 — Supabase keep-alive workflow (T019) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Scheduled workflow that pings hosted Supabase so the free project isn't paused (ADR 0005, R11).
- **Did:**
  - Added `.github/workflows/keepalive.yml`: cron every 3 days + `workflow_dispatch`, POSTs `/rest/v1/rpc/health` with the publishable key, fails on non-200 or missing config.
  - Documented `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (Actions variables) and the Workers Builds `NEXT_PUBLIC_*` mapping in `contracts/environment.md`.
  - PR #202 (Closes #23).
- **Decisions:** none. Used repo variables, not secrets, since both values are public.
- **Lessons:** T019 is blocked at runtime by T017 (hosted project) and #22 (T018), but the file itself can be written now; a config-check step makes the early failure explicit.
- **AI vs human:** agent wrote workflow, docs and PR; Sam must create the hosted project (T017) and set the two variables, then run the workflow once via dispatch.
- **Effort:** ~10 min wall-clock · PRs/issues: #202, #23

## Session 13 — Core schema migrations (T024–T026) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / medium
- **Goal:** Turn data-model.md into migrations: enums, reference tables, profiles, requests, allowances.
- **Did:**
  - Three migrations: enums + `holiday_regions`/`public_holidays`/`leave_types`; `profiles`; `leave_requests`/`allowance_overrides`/`allowance_changes`. RLS on everywhere, no policies yet.
  - Checked by hand in the local DB: bad IANA timezone rejected, profile timezone defaults from region, demo manager rejected, overlapping pending request hits the exclusion constraint, no table without RLS.
  - `db:reset`, `db:lint`, `db:test` all green.
- **Decisions:** none (shared `assert_valid_timezone()` helper used by both timezone triggers). The `leave_types` default-change trigger is deferred to the admin RPCs because it needs `changed_by`.
- **Lessons:** Docker Desktop wasn't running at the start; started it from `%LOCALAPPDATA%\Programs\DockerDesktop`. NOT NULL is checked after BEFORE triggers, so a trigger can fill a NOT NULL default.
- **AI vs human:** Agent did all of it. Sam skipped the manual steps (T010/T011/T017/T022, PR #199) to keep building.
- **Effort:** ~25 min wall-clock · PRs/issues: pending

## Session 13 — pgTAP user helpers + private helpers + whoami (T027–T030) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet 5.5 / medium
- **Goal:** Test-first helpers, `private` schema role helpers and `whoami()`.
- **Did:**
  - `tests.create_user` / `tests.create_request` fixtures in `00_helpers.sql` (self-tested, 11 asserts).
  - `rls_enabled.sql` and `whoami.sql`; migration `*_private_helpers.sql` (`private.current_role/is_admin/is_approver`, `whoami()` returning jsonb).
  - `rls_enabled` caught that Supabase default privileges give `anon` write grants → new migration `*_revoke_anon_writes.sql` (also alters default privileges).
  - `supabase test db`: 28/28 pass; `db lint` clean.
- **Decisions:** `whoami()` returns jsonb (matches the contract's subset of profile fields); helper fixtures auto-create the region so tests don't depend on seeds. No ADR.
- **Lessons:** Supabase's default grants are permissive; RLS-on is not enough — test grants too. Skipped the "confirm it fails" step for whoami (wrote test and migration in one pass); the rls_enabled test did fail first, usefully.
- **AI vs human:** All autonomous; nothing needed Sam. Plan mode not used (non-interactive session).
- **Effort:** ~15 min · PRs/issues: none yet (branch `feat/t024-schema` not pushed)

## Session 14 — Reference + holiday seeds (T031–T035) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Seed regions, leave types and 2026–27 public holidays, test-first.
- **Did:**
  - `seed_reference.sql` pgTAP (9 tests) written first and confirmed failing 8/9.
  - Migrations 000600–000900: regions + leave types, QLD (incl. Ekka), NSW, HK holidays, each citing its official source.
  - After `db reset`: 37 pgTAP tests pass, `db lint` clean.
- **Decisions:** Sundays not seeded (weekends never count). QLD Christmas Eve part-day and NSW Bank Holiday omitted. HK substituted days included. No ADR.
- **Lessons:** gov.hk pages returned empty via fetch; HK 2026 came from the gazette press release, HK 2027 from an aggregator cross-checked with news reports of the gov.hk list. QLD 2027 Anzac substitute (Mon 26 Apr) was disputed between aggregators; Fair Work + Qld Govt agree.
- **AI vs human:** Agent did all of it; Sam should spot-check 2027 HK dates against gov.hk.
- **Effort:** ~20 min · PRs/issues: none yet (branch feat/t024-schema unpushed)

## Session 15 — Access-matrix rows 1–9, policies + admin RPCs (T036–T048) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** opus / high (plan mode)
- **Goal:** Test-first RLS for profiles and reference data, plus the admin people and demo RPCs.
- **Did:**
  - Nine pgTAP files (`row01`–`row09`) written first and confirmed failing. X is an inactive *admin* in the write rows.
  - Migrations 001000–001400: truncate revoke, profiles policies, reference policies, `admin_create_profile` / `admin_update_user` / `admin_set_active`, `admin_set_demo_active`.
  - 14 files / 153 pgTAP tests pass, `db lint` clean. PR #204, stacked on #203.
- **Decisions:** [ADR 0009](../decisions/0009-grants-below-rls.md): hardened grants below RLS (TRUNCATE revoke, no-op privileges revoked, RPCs revoked from anon, security definer validation triggers).
- **Lessons:** The test-first run found a real hole that the spec missed: TRUNCATE ignores RLS, and Supabase grants it to `authenticated` by default. While writing the migrations we also found that the timezone triggers would have hit "permission denied" for any signed-in caller, because `assert_valid_timezone` is revoked from public. Tests that run only as `postgres` would never show either problem.
- **AI vs human:** The agent planned, built and opened the PR. Sam approved the plan.
- **Effort:** ~35 min · PRs/issues: #204 (closes #40–#52)

## Session 16 — T023 dry run: issue → @claude → PR → deploy · 2026-10-17
- **Where:** Claude Code + GitHub Action · **Model/effort:** opus / low (driving), action default
- **Goal:** Prove the full pipeline on one tiny change, after Sam replaced the OAuth token and installed the Claude app.
- **Did:**
  - Verified `CLAUDE_CODE_OAUTH_TOKEN` is set; re-ran Claude Review on #204, which posted a review.
  - Issue #205 (footer line) → `@claude` comment → branch pushed in 17s, 3-line diff exactly as asked.
  - PR #206: lint, typecheck, unit, e2e, db, build, Claude Review and the Cloudflare preview all green; preview showed the footer.
  - Sam merged; production (away.samuel-tse.workers.dev) redeployed with the footer. ~10 min end to end.
- **Decisions:** none.
- **Lessons:** The action stops at pushing a branch and posts a "Create PR" link; a human (or the driving agent) opens the PR. Fine for the demo; change the prompt to run `gh pr create` if we want it fully hands-off. Claude Review takes ~15s and noted it hadn't read the linked issue, so give it the issue text in the prompt.
- **AI vs human:** The agent created the issue, triggered and watched the run, opened the PR and checked the preview. Sam fixed the token/app, reviewed and merged.
- **Effort:** ~15 min · PRs/issues: #205, #206, #27

## Session 17 — Generated DB types and app plumbing (T049–T053) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Generate Supabase types, then add the dates and errors helpers test-first.
- **Did:**
  - Added the `types:gen` script and committed `src/lib/database.types.ts` (T049).
  - `src/lib/dates.ts`: `formatPlainDate`, `todayIn`, `leaveYear`, built on `Intl.DateTimeFormat('en-AU')` with no date library (T050, T051).
  - `src/lib/errors.ts`: `ActionResult<T>`, `toActionResult` and the code-to-copy map for the six seeded codes (T052, T053).
  - Lint, typecheck, 15 unit tests and 153 pgTAP tests all pass.
- **Decisions:** none. Tests import with relative paths because no `@/` alias is configured.
- **Lessons:** #203 and #204 had already merged, so the branch came from `main`, not the stacked branch the handoff named. Docker Desktop was off and had to be started.
- **AI vs human:** The agent did everything, including starting Docker. Sam still has to review the PR.
- **Effort:** ~15 min wall-clock · PRs/issues: none yet

## Session 18 — Supabase clients, admin helpers, Ledger tokens (T054–T059) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Finish Phase 2 plumbing: Supabase clients, auth helpers, design tokens, badges, local seed.
- **Did:**
  - Browser/server `@supabase/ssr` clients; `src/proxy.ts` refreshes the session with `auth.getUser()`.
  - `src/server/supabase-admin.ts` and `auth.ts` (`getViewer`, `assertAdmin`, `requireAdmin`).
  - Ledger tokens in `globals.css` (light + dark) and IBM Plex via `next/font`.
  - `badges.tsx` and `local-guard.ts`, each written after a failing test; `npm run seed:local` seeds 4 users (verified against the local stack, refuses a non-local URL).
  - Lint, typecheck, 30 unit tests, 153 pgTAP tests and `next build` all pass.
- **Decisions:** none new. Added `tsx` (free dev dependency) to run the seed script. Seeded users use region QLD, since that is what the reference seed contains.
- **Lessons:** the handoff said the previous work was uncommitted, but it was already committed; check `git status` before trusting a handoff. Vitest config had to include `.tsx` for the badge test.
- **AI vs human:** all autonomous. Plan mode was skipped because the handoff already fixed the scope.
- **Effort:** ~25 min wall-clock · PRs/issues: none yet

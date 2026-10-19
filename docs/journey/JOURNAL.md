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

## Session 19 — Auth test scaffolding, red phase (T060–T063) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Write the integration setup and the US1 auth tests first, and confirm they fail.
- **Did:**
  - Added `vitest.integration.config.ts`, `npm run test:integration` and `tests/integration/helpers.ts`. The helpers refuse a non-local URL and alias `server-only` to a stub.
  - Wrote `tests/integration/auth.test.ts`, `tests/unit/schemas-auth.test.ts`, `tests/e2e/fixtures.ts` and `tests/e2e/signin.spec.ts`.
  - Added `E2E_PASSWORD` to `.env.example`.
  - Lint passes. Typecheck and the two new suites fail only because `src/lib/schemas.ts` and `src/server/admin-users.ts` don't exist yet (T071, T078).
- **Decisions:** The `.env.local` file is loaded with Node's `process.loadEnvFile` because `loadEnv` isn't exported from `vitest/config`. Contract for T078: `inviteUser({admin, user}, input)` and `setUserActive({admin, user}, id, active)` return `ActionResult`. Contract for T071: schemas named `signInSchema`, `setPasswordSchema`, `passwordResetSchema`.
- **Lessons:** The tests fix the names and signatures that T071 and T078 must follow. zod isn't installed yet, so T071 has to add it (free).
- **AI vs human:** Agent did all of it. Not run against the local stack: the integration and e2e suites need Docker and a seeded stack.
- **Effort:** ~15 min · PRs/issues: none

## Session 20 — US1 pgTAP tests, auth schemas/actions, admin-users · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** T064–T071 and T078 from the session 19 handoff.
- **Did:**
  - Committed T060–T063. Added `zod`, `src/lib/schemas.ts`, `src/actions/auth.ts`, `invalid_credentials` in errors (T071).
  - Added `src/server/admin-users.ts` with compensation on a failed profile insert (T078). `test:integration` 7/7 and unit 37/37 pass.
  - Wrote pgTAP tests T064–T069. They are red until the T081–T083 migrations exist; row 24 already passes.
  - Added invite and recovery email templates and wired them in `config.toml` (T070).
- **Decisions:** none (no ADR).
- **Lessons:** In the Supabase CLI, `[auth.email] enable_signup = false` disables the whole email provider, so every password sign-in fails with "Email logins are disabled". Public signup is blocked by `[auth] enable_signup`. Set the email one to true.
- **AI vs human:** Agent did everything. Template and redirect URLs are untested end to end (needs the `/auth/confirm` route).
- **Effort:** ~40 min wall-clock · PRs/issues: none yet

## Session 21 — US1 migrations, auth UI, admin users · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Make pgTAP green (T081–T084) and build the US1 auth UI and admin users page (T072–T077, T079–T080).
- **Did:**
  - Migrations for balances, allowance policies and `admin_set_allowance`; pgTAP 208/208; types regenerated; `type_uncapped` added.
  - `/auth/confirm` (invite/recovery only, same-origin `next`), `/auth/sign-out`, sign-in / forgot / set-password pages, `(app)` shell with role-based nav, 403 page + admin layout, admin-users actions and page.
  - Lint, typecheck, 45 unit, 7 integration and 5 e2e tests pass. PR #209 already open; branch pushed.
- **Decisions:** The signed-in landing route is `/` (`(app)/page.tsx`), not `/dashboard`; `signIn`, e2e fixtures and smoke test updated to match. No ADR.
- **Lessons:** Supabase default grants let `anon` select new tables, so new tables need an explicit `revoke select ... from anon` (pgTAP caught it). Next's route announcer also has `role="alert"`, so e2e alert locators must filter by text. A long bash heredoc with mixed quoting failed silently; the Write tool is safer for many files.
- **AI vs human:** Agent did everything; nothing needed Sam.
- **Effort:** ~45 min wall-clock · context ~25% · PR #209

## Session 22 — US1 dashboard, e2e balances, CI jobs · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** T085–T089 from the session 21 handoff.
- **Did:**
  - `Balances` and `AllowanceLog` components; dashboard at `(app)/page.tsx` using `get_balances` for the leave year in the viewer's timezone plus their own allowance log.
  - `tests/e2e/balances.spec.ts` seeds a throwaway employee with approved and pending leave and asserts hand-calculated balances, including the "−1 day (over)" text and uncapped type.
  - CI: `e2e` now starts local Supabase, seeds with a generated masked password; new `integration` job. Lint, typecheck, 45 unit, 7 integration and 6 e2e pass locally.
- **Decisions:** `SeededUser` widened to a plain `{email,name,role}` so e2e can log in ad-hoc users. No ADR.
- **Lessons:** Approved `leave_requests` rows need `decided_by` and `decided_at` (check constraint), so direct test inserts must set them. CI workflow is untested until it runs on GitHub (the `supabase status -o env` key names are assumed).
- **AI vs human:** Agent did all code. T090/T091 are Sam's; Sam also adds `integration` to the required checks.
- **Effort:** ~30 min wall-clock · PR #209

## Session 23 — US2 request leave: tests first, then RPCs and actions (T092–T106) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** opus / high (plan mode for the schema work)
- **Goal:** Start US2: failing tests T092–T100, then the DB layer and server actions.
- **Did:**
  - Wrote 7 pgTAP files (rows 10–12, `count_working_days`, validation, stored values: 88 tests), the concurrent-submit integration test, the request schema unit test and `requests.spec.ts`; confirmed all of them red first.
  - Migrations `…001800`–`…002100`: `private.count_working_days`, `private.validate_request`, `preview_leave_request`, `submit_leave_request`, `leave_requests` select policy plus write/anon revokes. pgTAP 296/296, unit 57, integration 8, e2e 6 pass. `requests.spec.ts` stays red until the UI (T107–T109) exists.
  - `leaveRequestSchema`, six new error codes with copy, `src/actions/requests.ts` (`previewLeaveRequest`, `submitLeaveRequest`).
- **Decisions:** `validate_request` returns every problem in a fixed order. Preview returns them all, submit raises the first. `submit_leave_request` locks the caller's profile row (`for update`) so one user's submits run one at a time and see each other's days. The exclusion constraint stays as a backstop and its error is mapped to `overlap`. Preview is a one-row `returns table`, read with `.single()`. Work is on `feat/t092-request-leave`, stacked on the unmerged PR #209.
- **Lessons:** In plpgsql, `text[] || 'literal'` parses the literal as an array, so use `array_append`. `generate_series(date, date, interval)` resolves to `timestamptz` (time-zone dependent), so cast to `timestamp`. Fixing e2e copy and labels in the plan lets the UI session build to the test.
- **AI vs human:** Agent planned, wrote the tests and implemented everything; Sam approved the plan.
- **Effort:** ~60 min wall-clock · context at end ~15% · PRs/issues: none yet (stacked on #209)

## Session 24 — US2 request UI (T107–T110) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Build the leave request form and requests list so `requests.spec.ts` goes green.
- **Did:**
  - `RequestForm` (debounced live preview, blocking errors in `role="alert"`, submit disabled until valid), `/requests/new`, `/requests`, a "Requests" nav link.
  - "Upcoming leave" list on the dashboard (a list, not a table, so the e2e `row` locators stay unambiguous).
  - Lint, typecheck, unit 57, integration 8 and e2e 7 all pass. T107–T110 ticked.
- **Decisions:** none
- **Lessons:** `next build` OOM-crashes on this machine (about 1.4 GB free) at "Generating static pages using 10 workers", even on a clean tree. A temporary `experimental.cpus: 2` fixed it locally; not committed. The e2e run also needs `.env.local` exported into the shell, since Playwright doesn't load it.
- **AI vs human:** Agent did all of it autonomously; no input needed.
- **Effort:** ~25 min wall-clock · PRs/issues: none yet (push + PR pending)

## Session 25 — US3 approve or decline requests (T111–T125) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high for the plan, medium for the build
- **Goal:** Phase 5 of tasks.md: managers and admins decide pending requests, nobody decides their own.
- **Did:**
  - Wrote 6 pgTAP files, a concurrency test and an e2e spec first; confirmed they failed, then added `decide_leave_request` and `approval_queue` migrations.
  - Server Action, zod schema and error codes; `/approvals` page with decide form, over-balance flag and per-requester allowance log; dashboard count for approvers.
  - Lint, typecheck, unit 65, integration 9, pgTAP 354 and e2e 8 pass. Phase 5 checkpoint (T118) passes.
- **Decisions:** contract over FR-018 wording for who may decide whom, plus the check order (ADR 0010).
- **Lessons:** `db:reset` wipes seeded users, so rerun `seed:local` before e2e. Parallel Playwright workers crashed on this machine (`--workers=1` is stable), and a crashed worker skips cleanup: give e2e fixtures unique names so an orphan cannot break the next run. A shell heredoc with a parenthesised path (`src/app/(app)`) failed; use the Write tool for those files.
- **AI vs human:** all of it by the agent after plan approval; Sam approved the plan.
- **Effort:** ~45 min wall-clock · context at end ~25% · PRs/issues: none opened yet (branch `feat/t111-approvals`, based on #210)

## Session 26 — US4 team calendar (T126–T134) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high for the plan, medium for the build
- **Goal:** Phase 6 of tasks.md: a month calendar of who is away, with each region's holidays, respecting colleague privacy.
- **Did:**
  - Committed US3 (T111–T125) and opened PR #211 (base `feat/t092-request-leave`), then branched `feat/t126-team-calendar`.
  - Wrote 3 pgTAP files (rows 18–19, behaviour) and `calendar.test.ts` first; confirmed all red, then added the `team_calendar(p_from, p_to)` migration, regenerated types, `src/lib/calendar.ts`, `CalendarGrid`, `/calendar?month=YYYY-MM` and a Calendar nav link.
  - Added `tests/e2e/calendar.spec.ts` (not in tasks.md) to check the page in a real browser, including employee versus manager visibility of the leave type.
  - Lint, typecheck, unit 86, integration 9, pgTAP 384 and e2e 9 pass. Phase 6 checkpoint met; T126–T134 ticked.
- **Decisions:** `team_calendar` returns the person's current region (the calendar groups people by region), not the request's snapshot region. Leave cells show an icon with hidden text, plus a visible key and a holiday list, so status and region never rely on colour (FR-025). No ADR.
- **Lessons:** psql `\gset` lines cannot carry a trailing `-- comment` (it is parsed as extra variable names). A fixture that gives one user overlapping requests trips the exclusion constraint, so use one user per request. `next build` OOMs again locally: `experimental.cpus: 2` worked and was reverted before committing.
- **AI vs human:** Agent did all of it after Sam approved the plan and chose "commit US3, open PR, then branch". The calendar was checked by e2e only; nobody has looked at it at phone width.
- **Effort:** ~40 min wall-clock · PRs/issues: US3 is #211 (closes #115–#129); US4 branch has no PR yet (issues #130–#138)

## Session 27 — US5 profile region and timezone (T135–T139) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / medium
- **Goal:** Phase 7 of tasks.md: a user sets their own region and timezone, new requests and displayed dates follow.
- **Did:**
  - Wrote the pgTAP file, unit test and e2e spec first; the unit test failed red. The pgTAP test passed with no new migration because the column grant and RLS update policy already allowed it.
  - Added `profileSchema`, `updateProfile` action, `/profile` page with form, a Profile nav link, and a "Today is …" line on the dashboard so the timezone is visible.
  - Lint, typecheck, unit 90, integration 9, pgTAP 392 and e2e 10 pass. Phase 7 checkpoint met; T135–T139 ticked.
- **Decisions:** no schema change or new RPC; the region check is the FK and the timezone check is the existing trigger, with zod for friendly errors. No ADR.
- **Lessons:** `\b` inside a JS template literal is a backspace, not a word boundary (use `String.raw`). An accessible name like "Region and timezone" on a section collides with `getByLabel("Region")`. `next build` OOM is intermittent even with `cpus: 2`; rerun.
- **AI vs human:** all by the agent; no human decisions needed.
- **Effort:** ~30 min wall-clock · PRs/issues: none yet (branch `feat/t135-profile`, based on #212's branch)

## Session 28 — US6 admin settings and demo data · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Opus 5.5 / high (planned and built in one session)
- **Goal:** Phase 8 (T140–T161): admin leave types, allowances, holidays, demo data.
- **Did:**
  - Tests first: pgTAP D1–D3 and the default-allowance log, integration tests for demo reset (D4), disable (D5) and admin refusals, roster and schema unit tests, plus an admin e2e. The default-log test and the module tests failed until implemented; D1–D3 and the refusal test passed from the start because earlier phases had already built that behaviour.
  - Migration: an after-update trigger logs `default_allowance` changes with `user_id` null. Roster (6 fictional employees on `away-demo.example`), loader, `setDemoActive`, the local-only `demo:load` script (6 users, 12 requests in ~1 s), six admin actions with zod schemas, and four admin pages behind tabs.
  - Found and fixed a US4 bug while checking pages at 390 px: `/calendar` scrolled 976 px sideways because the absolutely positioned sr-only labels escaped the grid's scroller.
  - Lint, typecheck, unit 111, integration 24, pgTAP 415 and e2e 12 pass. T140–T161 ticked.
- **Decisions:** the log trigger skips writes with no signed-in caller (migrations, secret key), because `changed_by` is required and the app always edits as the admin. The loader batches profile inserts and skips sign-outs to stay under the Workers Free limit of 50 subrequests (~45 per reset). No ADR.
- **Lessons:** a `.sr-only` element inside an `overflow: auto` box needs a positioned ancestor, or it widens the page. A leftover `next start` on port 3100 makes Playwright reuse a stale build. Use `{ exact: true }` and scope locators to a table or region, because sr-only copies of names cause strict-mode clashes.
- **AI vs human:** all by the agent; no human decisions needed.
- **Effort:** ~90 min wall-clock · PRs/issues: closes #144–#165 (branch `feat/t140-admin-demo`, stacked on `feat/t135-profile`; no PR yet)

## Session 29 — Phase 9 polish (T162–T165) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** T162–T165: a11y e2e, 390 px mobile e2e, client-bundle secret check, README.
- **Did:**
  - Added `@axe-core/playwright` and `tests/e2e/a11y.spec.ts` (sign-in, dashboard, request form, calendar, approvals): no serious or critical WCAG 2.1 AA violations.
  - Added `tests/e2e/mobile.spec.ts`: 0 px page overflow at 390 px on the request form, calendar, dashboard, approvals and admin pages.
  - Added `scripts/check-client-bundle.mjs` and a CI step after `build:worker`.
  - Wrote `README.md` (setup and npm scripts).
- **Decisions:** none
- **Lessons:** the a11y audit found nothing to fix, so earlier design-token work held up. The admin route is `/admin/users`, not `/admin/people`.
- **AI vs human:** agent did all four tasks; T166–T168 are manual for Sam.
- **Effort:** ~15 min wall-clock · PRs/issues: none (branch not pushed)

## Session 30 — Commit Phase 9, review stack, manual-step brief · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / high
- **Goal:** commit T162–T165, review the stacked branches, write the T166–T168 instructions for Sam.
- **Did:**
  - Committed T162–T165 as `9cdc541` on `feat/t140-admin-demo`. No secrets in the diff.
  - Ran a high-effort code review of `main...HEAD`: 9 findings, none fixed yet. Spot-checked three (safeNext tab bypass, unbounded `count_working_days`, password minimum 6 vs 10) and all three are real.
  - Wrote `docs/handoff/MANUAL-T166-T168.md` for Sam.
- **Decisions:** none. Nothing pushed and no PRs opened, pending Sam's OK.
- **Lessons:** a stack of 5 open PRs with 150+ files is too big to review per PR. The review is better run on the whole stack before merging.
- **AI vs human:** agent did the commit, review and brief. Sam decides on pushing/PRs and what to fix; T166–T168 are Sam's.
- **Effort:** ~15 min wall-clock · PRs/issues: none (open stack: #208–#212)

## Session 31 — Fix review findings, push, open PRs · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** fix the recommended review findings, push the unpushed branches, open PRs.
- **Did:**
  - Fixed 5 findings in `237ad6d`: `safeNext` open redirect, unbounded `count_working_days` call order, `over_balance_days` on a negative balance, local password minimum 6 → 10, admin role check on every admin page. DB fixes are in a new forward migration, not edits to migrations that are in open PRs.
  - Filed the other 5 findings as #213–#217.
  - Pushed `feat/t135-profile` and `feat/t140-admin-demo`; opened #218 (US5) and #219 (US6 + Phase 9 + fixes), stacked on #212.
  - Green locally: lint, typecheck, unit 115, pgTAP 419, db lint, integration 24, e2e 15.
- **Decisions:** forward migration over in-place edits, because the earlier migrations may reach hosted before this PR does.
- **Lessons:** `git mv -f` silently overwrote an existing `tests/unit/safe-next.test.ts`; the drop from 111 to 108 unit tests caught it. Check `ls` before moving a file into a folder. `db reset` wipes seeded users, so re-run `seed:local` (password piped on stdin, env from `.env.local`) before e2e.
- **AI vs human:** agent did all of it after Sam's go-ahead. Left for Sam: set the hosted Supabase password minimum to 10; T166–T168.
- **Effort:** ~45 min wall-clock · PRs/issues: #218, #219; filed #213–#217

## Session 32 — Merge the stack, deploy DB, first hosted admin · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / low
- **Goal:** merge the PR stack, then get Sam signed in as admin on production.
- **Did:**
  - CI green on #218/#219; merged #208–#212, #218, #219 bottom-up as merge commits (retargeting each child to main). Squash would have conflicted every child.
  - Resolved a docs-only conflict on #202 and merged the keep-alive workflow.
  - Found the hosted DB had no schema: T018 (deploy-db workflow) was never built. Built it (#220); its merge pushed all 27 migrations to hosted.
  - Wrote docs/ops/BOOTSTRAP.md (T090) for the first admin. Sam signed in.
- **Decisions:** merge commits for a stacked PR chain. The auto-mode check blocked the first attempt to merge #220 (it triggers production migrations); Sam approved explicitly.
- **Lessons:** tasks.md checkboxes were unreliable as progress, so T018 slipped through. "Bypass rules" in GitHub's merge prompt means checks aren't done: wait instead.
- **AI vs human:** agent did the merges, workflow and doc. Sam set password length, created the auth user and ran the profile insert in the dashboard.
- **Effort:** ~40 min wall-clock · PRs/issues: #208-#212, #218-#220, #202

## Session 33 — LMS MCP server (local stdio) · 2026-10-17
- **Where:** Claude Code (VS Code) · **Model/effort:** opus 5.5 / medium (planned and built in one session)
- **Goal:** let Claude Code query, submit and approve leave through the existing RPCs, acting as a real user.
- **Did:**
  - Built a stdio MCP server in `mcp/` with 9 tools (`whoami`, balance, my requests, preview, submit, team calendar, pending, approve, decline).
  - Registered it in `.mcp.json` with `${LMS_*}` env expansion.
  - Tests: 10 unit, plus 15 integration against local Supabase over in-memory and real stdio transports. lint, typecheck, unit (125) and integration (39) are all green.
- **Decisions:** [ADR 0011](../decisions/0011-lms-mcp-local-stdio.md):
  - email and password sign-in, no service key, with a guard that refuses secret keys
  - lives in the root package
  - leave types by name
  - extra `preview_leave` tool
  - `cancel_request` deferred
- **Lessons:**
  - Because authorization lives in Postgres, the MCP server needed zero new DB work and no permission logic; the tools are thin shapers.
  - Reusing `toActionResult`/`ERROR_COPY` gave Claude the same error copy as the web app for free.
  - Next's `ProcessEnv` typing makes `NODE_ENV` required, so pure env parsers should take a plain record.
- **AI vs human:** the agent planned (plan mode), built and tested autonomously. Sam approved the plan. Sam still needs to approve the project MCP server in Claude Code and set the `LMS_*` env vars.
- **Effort:** ~40 min wall-clock · context at end ~10% · PRs/issues: feat/mcp-server PR

## Session 34 — Review PR #222 (LMS MCP server) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** opus (brief said sonnet) / high
- **Goal:** Independent review of PR #222, fix real findings, get CI green.
- **Did:**
  - `/code-review high` found 10 issues. 8 were fixed, 1 was resolved by opening an issue, and 1 was declined with a reason (in the PR body).
  - Results now carry the summary and error message in `structuredContent`, because Claude Code shows the model that and not the text.
  - Sign-in now recovers after the session is signed out. Network failures are no longer reported as a bad password.
  - Fixed the misleading `team_calendar` range error and the "null days" text from `preview_leave`.
  - Opened #223 so the PR has an issue to close. CI is fully green.
- **Decisions:** keep both text and `structuredContent`, with no `outputSchema` (added to ADR 0011).
- **Lessons:** MCP clients differ in which part of a result the model sees. Test what the model actually receives, not only the text. The review also caught a session bug that tests didn't: a session that gets signed out stays dead until restart.
- **AI vs human:** the agent did the review, the fixes, the tests, the issue and the PR update on its own. Sam merges.
- **Effort:** ~25 min · context at end ~15% · PRs/issues: #222, #223

## Session 35 — Supabase MCP (dev) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Register a read-only Supabase MCP server for the local stack in `.mcp.json`.
- **Did:**
  - Probed the local stack. `supabase status` lists `MCP_URL` on 55321, but that route returns an empty 400 on CLI 2.121.0.
  - Studio serves the same MCP server at `127.0.0.1:55323/api/mcp`. With `?read_only=true` it has 10 tools (no `apply_migration`), and a probe CREATE TABLE was rejected.
  - Added `supabase` (HTTP) to `.mcp.json`, a README section, ADR 0012, and ticked the roadmap.
- **Decisions:** Use the Studio endpoint in read-only mode, with no npm package and no token. [ADR 0012](../decisions/0012-supabase-mcp-local-studio-readonly.md)
- **Lessons:** The CLI's advertised MCP_URL isn't always the one that works, so probe it before wiring. The read-only flag was easy to verify with one bad write.
- **AI vs human:** Agent did all of it. Sam still needs to approve the new project server in Claude Code.
- **Effort:** ~10 min · context ~15% · PRs/issues: none yet

## Session 36 — Plan: Google Calendar sync on approval · 2026-10-17
- **Where:** Claude Code · **Model/effort:** opus / high (plan mode)
- **Goal:** Agree how approved leave gets onto Google Calendar, before building anything.
- **Did:**
  - Opened PR #224 for the Supabase MCP branch (housekeeping from the handoff).
  - Wrote the plan in plan mode. Sam agreed it. It is saved as `docs/spec/CALENDAR-SYNC.md`, tracked in issue #225.
  - Wrote ADR 0013. Created branch `feat/calendar-sync`, stacked on #224.
- **Decisions:** [ADR 0013](../decisions/0013-google-calendar-sync-outbox.md): Postgres outbox + triggers → pg_cron kick (Vault-gated) → Supabase Edge Function → Calendar API. One shared team calendar via a service account. Title "Name — Away" with no leave type. Demo users are synced. Deleting an approved request deletes its event.
- **Lessons:** Grepping for every caller of `decide_leave_request` changed the answer. The MCP server and the demo loader approve too, so an app-side hook would have missed them. The demo reset cascade-deletes requests, so "delete on delete" is needed to avoid duplicate events. The Worker's 50-subrequest budget ruled out syncing inline.
- **AI vs human:** The agent read the code, compared the options, wrote the plan and ADR, and opened the PR and issue. Sam chose the calendar target, the title privacy and syncing demo users, and approved the plan.
- **Effort:** ~25 min wall-clock · context at end ~10% · PRs/issues: #224, #225

## Session 37 — Build: Google Calendar sync on approval · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Build the outbox → pg_cron → Edge Function → Calendar API sync from the agreed plan (#225).
- **Did:**
  - Migration with `private.calendar_outbox`, approve and delete triggers, `calendar_sync_claim` and `calendar_sync_finish` (service_role only), and a Vault-gated pg_cron kick.
  - Edge Function `calendar-sync` (`index.ts` plus a pure, unit-tested `lib.ts` that signs the JWT with WebCrypto), config, `.env.example`, deploy step, access-matrix rows 26–27, README section, types regen.
  - pgTAP: rows 26–27 and behaviour tests. Vitest: event shape, id, classify table, JWT.
  - Ran it locally against the real shared calendar: an approval created the event, deleting the request removed it.
- **Decisions:** None beyond ADR 0013.
- **Lessons:** Once a test switches to `service_role`, `tests.reset_role()` is no longer callable, so switch back with `set_config('role', 'postgres', true)`. `row20_get_balances_scope` fails on a local DB that holds leftover dev requests; it needs a clean `db reset`.
- **AI vs human:** Agent built and verified it. Sam still sets hosted secrets and Vault entries after merge. The demo-reset duplicate check was not run.
- **Effort:** ~30 min · PRs/issues: #225

## Session 38 — Fix code-review findings on calendar sync · 2026-10-17
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high
- **Goal:** Fix the 9 findings from `/code-review high 226` on the calendar-sync PR.
- **Did:**
  - Moved the batch loop out of the untested `index.ts` into `lib.ts` (`processRows`), so lint, tsc and vitest now cover it. `index.ts` is thin Deno glue.
  - New `defer` outcome: a token failure waits 10 minutes and gives the attempt back, so a bad key or Google outage can no longer push rows to `failed_at`.
  - `calendar_sync_finish` takes the claim's `p_attempts` and ignores stale or already-finished rows. Finish errors are logged and counted.
  - 8 s timeout per Google call, batch of 10, lock raised to 3 min, 202 plus `EdgeRuntime.waitUntil`, pg_net timeout 10 s.
  - Trigger skips demo users and also fires for rows inserted already approved. Claim returns nulls (so a create is done) when the request is not approved.
  - Fixed the no-op PEM test. Added 8 `processRows` unit tests and 6 pgTAP cases.
- **Decisions:** Edited the migration in place (branch unmerged, nothing deployed). Kept 403 on create as `fail` per the spec. Approved-request date edits not synced: no code path changes them. No new ADR; refines 0013.
- **Lessons:** Pulling logic out of an excluded entrypoint is cheaper than adding Deno tooling to CI. A first-pass review caught real overlap and retry-budget bugs that the happy-path tests could not.
- **AI vs human:** Agent did all of it. Not verified: `EdgeRuntime.waitUntil` and `index.ts` on a real Deno runtime (no Deno CLI here), so run the function locally once before merge. `db reset` wiped local dev data.
- **Effort:** ~40 min · PRs/issues: #225, #226

## Session 39 — Verify calendar sync (PR #226) · 2026-10-17
- **Where:** Claude Code · **Model/effort:** sonnet / high
- **Goal:** Re-review the session 38 fixes, run the Edge Function locally end to end, then commit and push.
- **Did:**
  - `/code-review high 226` found 8 items. Fixed 6: rate-limit 403s now retry (401/408 too), a delete waits for an unfinished create of the same request, the delete trigger skips demo users, a throwing `finish` no longer strands the batch, the backoff index is clamped, and a token response with no `access_token` is an error.
  - Local e2e passed with `supabase functions serve`: 401 without the secret, 202 plus `waitUntil`, `npm:@supabase/supabase-js` and `p_attempts` all work. One approval created the all-day event on the test calendar, and deleting the request removed it.
  - Lint, typecheck, 163 unit tests, 452 pgTAP tests and `db lint` pass.
- **Decisions:** A plain 403 still fails; only a 403 whose body names a rate or quota reason retries. Not fixed: the `defer` attempts decrement leaves a benign stale-report window; `index.ts` still has no lint or tsc coverage; the Supabase MCP commit stays in #226 rather than rewriting pushed history.
- **Lessons:** Sam's `.env` could not be read, so the shared secret went into local Vault through one shell pipeline and the e2e still ran. Applying the changed functions with `create or replace` avoided a `db reset` that would have wiped Vault.
- **AI vs human:** Agent did the review, fixes and e2e. Sam confirmed the calendar was a test one.
- **Effort:** ~50 min · PRs/issues: #225, #226

## Session 40 — Switch on calendar sync on hosted · 2026-10-18
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / low
- **Goal:** Merge #226, set the hosted pieces, smoke test one approval end to end.
- **Did:**
  - Sam merged #226 and set the four function secrets, the two Vault secrets and deployed `calendar-sync` on hosted.
  - Smoke test passed: approval created the event (outbox 1), deleting the request removed it (2), and deleting a request whose event never existed also completed (3).
  - Hosted was missing migration `20261017070000`; applied with `supabase db push`.
- **Decisions:** none. Not fixed: `Deploy DB` did not run on the #226 merge; `deno check` CI step; the `.mcp.json`/ADR 0012 ride-along; `defer` decrementing `attempts`.
- **Lessons:**
  - Hosted setup had five gaps the local run could not show: function not deployed by CI, migration not pushed, Auth Site URL still localhost, invite link burned by a second click, `SUPABASE_SECRET_KEY` entered as a plain Variable not a Secret.
  - Nobody can decide their own request, so a one-admin hosted app cannot approve its own test leave. A second account is needed.
  - The sync fires only on row delete of an approved request, and the app has no cancel for approved leave.
- **AI vs human:** Agent diagnosed from code and wrote the commands and SQL. Sam ran every hosted change and kept secrets out of the chat.
- **Effort:** long, many small hosted steps · PRs/issues: #226

## Session 41 — Why `Deploy DB` skipped the #226 merge · 2026-10-18
- **Where:** Claude Code · **Model/effort:** sonnet / high
- **Goal:** Find out why `deploy-db.yml` did not run for the #226 merge, and fix it.
- **Did:**
  - Root cause: not the workflow. #226 was a stacked PR whose base was `chore/supabase-mcp-dev`, so it merged into that branch, never `main`. `on: push: branches: [main]` correctly did not fire. No path filter exists.
  - #224 (`chore/supabase-mcp-dev` → `main`) is still open, mergeable and clean. Merging it carries #226 to `main` and will trigger the deploy.
  - `supabase/config.toml` already has `[functions.calendar-sync] verify_jwt = false`; the function checks its own `CALENDAR_SYNC_SECRET`. CLI 2.121.0 has `--no-verify-jwt`.
  - Prepared a one-line change adding `--no-verify-jwt` to the deploy step (uncommitted, in worktree `../lms-fix`, branch `fix/deploy-functions-no-verify-jwt`). Commit was blocked by the permission classifier, so it is not committed or pushed.
- **Decisions:** none yet. Open: whether to add the explicit flag, or rely on config.toml.
- **Lessons:** A "skipped" workflow after a merge: check the PR's base branch first. Stacked PRs merge into the parent branch, not `main`.
- **AI vs human:** Agent diagnosed. Merging #224 and the flag change need Sam.
- **Effort:** ~10 min wall-clock · PRs/issues: #224, #226

## Session 42 — Land #224 and verify Deploy DB · 2026-10-18
- **Where:** Claude Code · **Model/effort:** sonnet / low
- **Goal:** Merge #224 (carrying the stacked #226) and confirm `Deploy DB` deploys `calendar-sync`.
- **Did:**
  - Merged #224 into `main` with Sam's approval.
  - `Deploy DB` run 39043136612 on `main` succeeded: `db push` and `functions deploy calendar-sync` both ran.
  - Removed the `lms-fix` worktree and deleted the unused `fix/deploy-functions-no-verify-jwt` branch.
- **Decisions:** Rely on `verify_jwt = false` in `supabase/config.toml`; no explicit `--no-verify-jwt` flag in the workflow (config is the single source of truth, function checks its own secret).
- **Lessons:** Stacked PRs merge into their parent branch, not `main`, so the deploy never fired. Retarget to `main` before merging the parent, or avoid stacking.
- **AI vs human:** Agent ran the merge, checked the run and cleaned up. Sam made the flag decision and approved the merge.
- **Effort:** ~5 min wall-clock · context low · PRs/issues: #224, #226

## Session 43 — Housekeeping, remote MCP scope, demo issues · 2026-10-18
- **Where:** Claude Code · **Model/effort:** sonnet / low
- **Goal:** Add explicit `--no-verify-jwt`, log Sam's manual test, bring remote MCP into scope, queue demo issues.
- **Did:**
  - Verified `calendar-sync` returns 401 on missing or wrong secret; PR #227 adds `--no-verify-jwt` (ADR 0014).
  - Sam manually tested Google Calendar sync on approval end to end and cleaned up the test data.
  - Remote LMS MCP moved from stretch to in scope; spec #232 and plan #233 created, not built.
  - Queued demo issues #228-#231 (small UI-only); #180 lost `status:ready` as too big for ~10 min.
- **Decisions:** ADR 0014 (Sam): explicit `--no-verify-jwt`; the shared secret is the only gate.
- **Lessons:** The earlier `--force` worktree removal threw away the uncommitted flag edit; redoing it was cheap, but check before force-removing.
- **AI vs human:** Agent did the checks, PR, issues and docs. Sam made the flag decision and ran the calendar test.
- **Effort:** ~15 min wall-clock · PRs/issues: #227, #228-#233

## Session 44 — Spec for the remote LMS MCP server · 2026-10-19
- **Where:** Claude Code · **Model/effort:** opus / high (plan mode)
- **Goal:** Answer #232: how Claude chat reaches the LMS MCP over HTTPS, safely, for $0.
- **Did:**
  - Wrote `docs/spec/REMOTE-MCP.md`: architecture, hosting, auth, tools, write confirmation, threat model, tests, Sam's manual steps, and the checks the plan must do first.
  - Wrote ADR 0015. Updated ROADMAP Phase 4 and `MCP-TOOLS.md`.
- **Decisions:** (ADR 0015)
  - Supabase OAuth 2.1 server, with dynamic registration off and one pre-registered public PKCE client.
  - `/mcp` only accepts tokens whose `client_id` is on an allowlist.
  - Stateless route in the existing app Worker, with a separate Worker as the fallback if the 3 MiB bundle limit is hit.
  - Remote writes need an HMAC preview token bound to the user and the arguments. New `preview_decision` tool.
  - All 9 local tools exposed from one shared registry.
- **Lessons:**
  - The Supabase CLI config already had `[auth.oauth_server]`, which made OAuth cheaper than a demo token.
  - Supabase has no custom scopes, so the tool subset is the scope and RLS is still the only gate.
  - Free-tier availability of the OAuth server is unverified, so it's the plan's first check.
- **AI vs human:** The agent read the code and drafted the options and the spec. Sam picked auth, client registration and write strictness.
- **Effort:** ~30 min wall-clock · PRs/issues: #232 (spec), #233 next

## Session 45 — Plan for the remote LMS MCP server · 2026-10-19
- **Where:** Claude Code · **Model/effort:** sonnet / high
- **Goal:** Answer #233: turn the remote MCP spec into a plan, tests, a security checklist and build issues.
- **Did:**
  - Ran the spec's checks and wrote them into `docs/spec/REMOTE-MCP.md`: OAuth server is on Supabase Free, Claude's callback URLs and no-secret client work, SDK web transport and `auth.oauth` API names confirmed, `preview_decision` needs no new RPC.
  - Wrote `docs/spec/REMOTE-MCP-PLAN.md` (order, tests with refusals first, security checklist) and created issues #236-#247 (3 `manual`, 3 `status:ready`).
  - Measured the Worker baseline: gzip 1996 KiB (gate 3 MiB, work limit 2.7 MiB).
- **Decisions:** none new (ADR 0015 stands).
- **Lessons:**
  - CPU, not bundle size, is the free-tier risk: Workers Free gives 10 ms per invocation and it can only be measured on a deploy.
  - `src/proxy.ts` runs on every path and the sign-in form ignores `next`; neither was in the spec.
  - The Workers rate-limit binding has no documented price but no explicit "Free" either, so the plan keeps an in-memory fallback.
- **AI vs human:** Agent did the checks, plan and issues. Sam still has to do the dashboard and Cloudflare steps (#236, #245, #246).
- **Effort:** ~25 min wall-clock · PRs/issues: #233 (closed by the PR), #236-#247

## Session 46 — Move the MCP core to src/server/mcp (#237) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Pure move of the transport-free MCP core so stdio and the future Next.js route share it.
- **Did:**
  - `tools.ts`, `format.ts` and a new `session.ts` (types, `isPrivilegedKey`, `loadViewer`) now live in `src/server/mcp/`; `mcp/src/` keeps only `index.ts`, `readEnv`, `createSessionProvider`.
  - `isPrivilegedKey` uses `atob` + `TextDecoder`, no `Buffer`; the core has no `node:*` imports.
  - ADR 0011 status notes the "nothing in src/ imports it" rule is superseded by 0015.
  - Lint, typecheck, 163 unit and 40 integration tests (incl. stdio `tools/list`) pass; `build:worker` builds. Tests changed only in import paths.
- **Decisions:** none (follows ADR 0015).
- **Lessons:**
  - No `@/` alias exists; `src/` uses relative imports, so the first attempt failed typecheck.
  - Integration tests need Docker + local Supabase; the first run failed on connection until Docker was started.
- **AI vs human:** Agent did the move and checks. Sam started Docker.
- **Effort:** ~20 min wall-clock · PRs/issues: #237

## Session 47 — Preview-token module (#238) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** `signConfirmation` / `verifyConfirmation` for the remote MCP write guard (spec Decision 4).
- **Did:**
  - `src/server/mcp/confirmation.ts`: HMAC-SHA256 tokens, WebCrypto only, 10 min expiry, bound fields per tool.
  - `tests/unit/confirmation.test.ts` first: 28 tests, refusals before happy path. Lint, typecheck and `npm test` pass.
- **Decisions:** Failure reasons are `missing | malformed | bad_signature | expired | wrong_user | wrong_tool | wrong_args`. The signature is checked before the payload is parsed. Bound arg names are `leave_type_id`, `start_date`, `end_date`, `request_id`, `outcome`; #239 maps tool input onto them. A missing bound arg throws on sign and refuses on verify. The short-secret check also throws on verify.
- **Lessons:**
  - Sam's uncommitted docs blocked `git checkout main`; a worktree off `origin/main` (with a `node_modules` junction) left them untouched.
  - `Uint8Array<ArrayBufferLike>` is not a `BufferSource` in TS 6; the decoder is typed `Uint8Array<ArrayBuffer>`.
- **AI vs human:** Agent did everything.
- **Effort:** ~20 min wall-clock · PRs/issues: #238

## Session 48 — preview_decision and write confirmations (#239) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** Wire confirmation tokens into the MCP write tools and add `preview_decision`.
- **Did:**
  - `createLmsServer(getSession, { requireConfirmation, confirmSecret })`; `preview_leave` and the new `preview_decision` return tokens; the three write tools refuse with `confirmation_required`.
  - 34 unit tests (fake client, zero RPC calls on every bad token) and 7 integration tests; lint, typecheck, unit (226) and integration (47) pass.
  - README and `MCP-TOOLS.md` updated.
- **Decisions:** `submit_leave` binds the leave type id, so it reads `leave_types` before verifying. That is a read, not a write RPC. A missing token is refused before even that read. All failure reasons show one message so a client learns nothing about why.
- **Lessons:**
  - Removing a git worktree that had a `node_modules` junction deleted most of the real `node_modules`. Use `npm ci` in a worktree, never a link. Recovery needed stopping the local MCP server that held `esbuild.exe`.
- **AI vs human:** Agent built it. Sam approved stopping the MCP server process.
- **Effort:** ~40 min wall-clock · PRs/issues: #239

## Session 49 — Local OAuth server and bearer-token checks (#240) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** Opus 5.5 / high, plan mode (auth)
- **Goal:** Local Supabase issues OAuth tokens for tests, and `/mcp` has a bearer-token check (spec Decision 2).
- **Did:**
  - `[auth.oauth_server] enabled = true` locally (dynamic registration stays off).
  - `src/server/mcp/auth.ts`: `authenticate()` checks bearer → `getClaims` (signature, expiry) → `iss` → `aud` → `client_id` allowlist, and returns one identical 401 with `WWW-Authenticate: Bearer resource_metadata=…`. `parseAllowedClientIds` treats an empty list as "nobody".
  - 23 unit tests with a WebCrypto ES256 key and the real `getClaims(jwt, { jwks })`. A fetch that fails if called proves there's no network call.
  - `createOAuthClient()` and `oauthTokenFor()` run PKCE authorize, consent via `auth.oauth` and the token exchange with no browser. 4 integration tests: OAuth token passes; web-session and other-client tokens are refused.
- **Decisions:** none new (ADR 0015 covers it). The 401 body is `{"error":"invalid_token"}` for every cause.
- **Lessons:** Read auth-js before writing the test harness. `getClaims` fetches the JWKS over the network when the `kid` doesn't match, and falls back to `getUser` for HS tokens. Without that, a "bad signature" unit test could have passed for the wrong reason. Local Supabase serves OAuth metadata at `/auth/v1/.well-known/oauth-authorization-server`, not the RFC 8414 root path. #242 should check that discovery works.
- **AI vs human:** Agent planned, built and tested end to end. Sam approved the plan. No hosted settings were touched.
- **Effort:** ~25 min wall-clock · PRs/issues: #240

## Session 50 — The /mcp route and protected-resource metadata (#242) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high
- **Goal:** Stateless `POST /mcp` in the app Worker, discovery metadata, proxy exclusion, size gate.
- **Did:**
  - `src/server/mcp/handler.ts` holds the logic as Request → Response (route files stay thin): config check (refuses a secret key), `authenticate`, per-request client, `createLmsServer({ requireConfirmation })`, stateless web-standard transport. GET and DELETE give 405 with `Allow: POST`.
  - Metadata on `/.well-known/oauth-protected-resource` and `.../mcp`; `src/proxy.ts` skips `mcp` and `.well-known`; `.env.example` gets the two new variables.
  - Logs carry user id, tool, outcome and duration only.
  - 8 unit tests (401 before any Supabase call, identical 401 body, 405s, metadata, matcher, log redaction) and 3 integration tests (no token and web token give 401; OAuth token gets `initialize` and `tools/list` with 10 tools). Lint, typecheck, 257 unit, 57 integration pass.
  - Worker gzip 2170.59 KiB (baseline 1996.21, gate 2764.8); recorded in the spec.
- **Decisions:** none new. `tools.ts` used to log the whole error object, and my log test showed Postgres text reaching the logs. It now logs a known error code or `unexpected`.
- **Lessons:** `next build` crashes on this Windows machine at 15 workers (out of memory), on `main` too. Setting `experimental.cpus: 2` temporarily got `build:worker` through; not committed. `preview:worker` could not run (workerd out of memory), so the OpenNext POST `initialize` check is still open for Sam or CI.
- **AI vs human:** Agent built and tested. Nothing hosted was touched.
- **Effort:** ~40 min wall-clock · PRs/issues: #242

## Session 51 — Consent page and sign-in `next` (#241) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / high, plan mode (auth and UI)
- **Goal:** The `/oauth/consent` page Supabase redirects to, and sign-in that returns to it (spec Decision 2).
- **Did:**
  - `signIn(input, next)` redirects through `safeNext`; the sign-in page and form pass `next` along.
  - `decideAuthorization` server action: needs a session, only an active profile can approve, anyone signed in can deny, a Supabase error becomes friendly copy. It redirects to the `redirect_url` Supabase returns.
  - `src/app/oauth/consent/page.tsx` shows app name, redirect host, signed-in user and what the connector can do. Signed-out visitors go to `/sign-in?next=…`; an already-consented request redirects straight back; inactive profiles get "not active" copy and no Approve button.
  - Tests first: 20 new unit tests and 9 Playwright specs (sign-in round trip, approve with `code` and `state`, deny with `access_denied`, bad id, deactivated user, keyboard only, axe and 375px in light and dark). Lint, typecheck, 277 unit, 23 e2e and 54 integration pass.
  - Housekeeping: two ADRs were numbered 0014, so the remote MCP one is now `0015-remote-mcp-supabase-oauth.md`. Spec, plan, roadmap, ADR 0011, journal, a code comment, 12 issues and open PR #252 updated; merged PRs #235 and #248 and old commit messages still say 0014. The calendar-sync ADR keeps 0014.
  - Sam's manual steps, guided from screenshots: #236 (hosted OAuth server: ES256 keys, path `/oauth/consent`, dynamic registration off, Site URL, 3600 s expiry, refresh-token reuse detection on) and #245 (public client "Claude" with both callback URLs; `MCP_ALLOWED_CLIENT_IDS` and `MCP_CONFIRM_SECRET` set as Cloudflare Production secrets). Comments posted on both issues; Client ID recorded in `mcp/README.md`.
- **Decisions:** ADR 0014 (remote MCP) renumbered to 0015; the calendar-sync ADR keeps 0014. Deny needs only a session, so a deactivated person can still back out of a request.
- **Lessons:** The shared auth card had two bugs that sign-in never showed: 9px of horizontal overflow at 375px (no `border-box`) and a dark-mode contrast failure (`--brand` is a background colour in dark). Fixed in `(auth)/layout.tsx`; the e2e axe and mobile checks found them. Next's route announcer is also `role=alert`, so alert locators need a text filter. Local `site_url` is port 3000, so the e2e test keeps only the path of the authorize redirect.
- **AI vs human:** Agent planned (Sam approved), built and tested. It ran `seed:local` on the local database, because the seeded users were missing. `build:worker` could not run here: a `preview:worker` session left running on :8787 (not started by the agent, left alone) locks `.open-next`. One integration run reported an error that I couldn't reproduce in three reruns.
- **Effort:** ~50 min wall-clock · PRs/issues: #241
- **Usage (ccusage, 2026-10-19, this project only):** 47 Claude Code sessions since 2026-10-16 · input 3,276 · output 1,246,871 · cache write 3,888,284 · cache read 140,313,547 · total 145,451,978 tokens · **$56.81** at API list prices (Opus 5.5 $30.49, Sonnet 5.5 $26.32 by model). Not what Sam paid on the plan.
  - Scoped by matching ccusage session ids to this project's transcript folder, because `ccusage daily` is machine-wide: $2,001.27 over 39 days, which includes other projects (for example $71.13 from Little Sylly Games since 10-16). Don't use that figure for the presentation.
  - Misses Claude chat sessions (such as session 01) and GitHub Action runs. This session is still running, so the numbers grow slightly.

## Session 52 — Rate limit on /mcp (#243) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** Sonnet 5.5 / medium
- **Goal:** Loose flood protection on `/mcp` at $0.
- **Did:**
  - `src/server/mcp/rate-limit.ts`: `limiter(binding | undefined)` returns `check(key)` (Workers binding, or a fixed window per key in memory, 60 per 60 s), plus the shared 429 with `Retry-After`.
  - Handler: per-IP check (`ip:<CF-Connecting-IP>`) before token verification, per-user check (`sub:<sub>`) after. The route uses `MCP_LIMITER` from the Cloudflare context and falls back to a module-level in-memory limiter.
  - `wrangler.jsonc` gets a `ratelimits` entry; spec threat-model row notes it is a loose filter (per location, eventually consistent).
  - Tests first (9 new). Lint, typecheck, 285 unit and 54 integration pass.
- **Decisions:** none new. No IP header (local dev) means no IP check. A throwing binding fails open, since auth still applies.
- **Lessons:** `wrangler deploy --dry-run` on the real config fails on a stale `.open-next` (same on `main`), so the config was checked with a stub Worker: it accepts `MCP_LIMITER`. Whether the Free plan accepts it is only known at the real deploy.
- **AI vs human:** Agent did all of it; nothing hosted was touched.
- **Effort:** ~25 min wall-clock · PRs/issues: #243

## Session 53 — Remote MCP integration tests (#244) · 2026-10-19
- **Where:** Claude Code · **Model/effort:** sonnet / medium
- **Goal:** End-to-end proof that the remote /mcp server can only do what the person can do.
- **Did:**
  - Added `tests/integration/mcp-remote.test.ts`: cases 1 to 9 (refusals) then two happy paths, using real local OAuth tokens through `handleMcpPost`.
  - No source changes. A fake `Date` (vitest `toFake: ["Date"]`) stands in for the clock, so the stale-confirmation case needed no clock injection.
  - A `makeClient` wrapper counts `from`/`rpc` calls to prove a 401 reads nothing.
  - Integration suite 67/67, unit 285/285, lint and typecheck clean.
- **Decisions:** none. Branched from `feat/rate-limit` because PR #257 (#243) was still open; retarget to `main` after it merges.
- **Lessons:** Shared test users make "nothing was created" checks leak between cases; scope them by date.
- **AI vs human:** Agent wrote and ran everything; Sam merges #257, then this PR.
- **Effort:** ~25 min wall-clock · context ~20% · PRs/issues: #244, #257

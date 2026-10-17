# Tasks: Away MVP — team leave management

**Input**: Design documents from `/specs/001-mvp/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED for every behaviour change and every RLS policy (Constitution III and V). Within a story, write the tests first and confirm they fail before implementing. Every row of [access-matrix.md](contracts/access-matrix.md) has its own pgTAP task with an allowed case and a refused case.

**Organization**: Setup and pipeline first (ROADMAP Phase 2), then Foundational, then one phase per user story (ROADMAP Phase 3). Each task is sized to become one GitHub issue.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story from spec.md (US1–US6). Setup, Foundational and Polish tasks have none.
- **🧑 manual**: Sam does it in a dashboard or with an account the agent can't reach. An agent can prepare the instructions, but must not link Cloudflare or Supabase itself.
- `FR-`/`SC-`/`US` references point at spec.md; "row N" and `D1`–`D5` point at access-matrix.md.

## Conventions used below

- **Migrations**: create each with `npx supabase migration new <name>` so timestamps order correctly. Migration tasks are never `[P]` against each other.
- **pgTAP**: one file per access-matrix row, `supabase/tests/rowNN_<slug>.sql`, so each row stays one issue-sized task (plan.md says "one file per area"; this is the same layout split finer). Behaviour tests use `supabase/tests/<slug>.sql`. Every file runs in a rolled-back transaction and uses the helpers in `supabase/tests/00_helpers.sql`.
- **Generated types**: `src/lib/database.types.ts`, produced by `npm run types:gen` (`supabase gen types typescript --local`). Re-run it after any migration task that changes the schema or adds an RPC.
- **Phase mapping**: tasks.md Phase 1 = ROADMAP Phase 2 (pipeline). Phases 2–9 = ROADMAP Phase 3. Plan "Delivery slices" map as: slice 1 → Phase 2, slice 2+3 → Phase 3 (US1), slice 4 → Phase 4 (US2), slice 5 → Phase 5 (US3), slice 6 → Phases 6–7 (US4, US5), slice 7 → Phase 8 (US6).
- **Not in this file**: MCP server work (Phase 4 of the ROADMAP, `docs/spec/MCP-TOOLS.md`) and the nine spec Backlog items. `team_calendar`, `approval_queue` and the Server Action layer are the extension points those will use.

---

## Phase 1: Setup & Pipeline (ROADMAP Phase 2)

**Purpose**: a walking skeleton on Workers, CI that gates every PR, previews, a database pipeline proven by one tiny RPC, and the agent workflows. Nothing in Phase 2 or later starts until this phase is done.

### App skeleton

- [ ] T001 Scaffold the Next.js 16.4 App Router app (React 19, TypeScript 6.0, Node 24) at the repo root without overwriting existing files (`CLAUDE.md`, `docs/`, `.specify/`, `specs/`): `package.json` (pin `engines`), `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, a placeholder `src/app/page.tsx`
- [ ] T002 [P] Add ESLint 10 + typescript-eslint 8 flat config in `eslint.config.mjs` and the `lint` and `typecheck` scripts in `package.json`
- [ ] T003 [P] Add Vitest 5 in `vitest.config.ts`, the `test` script, and one passing sample test `tests/unit/smoke.test.ts`
- [ ] T004 [P] Add Playwright 1.64 in `playwright.config.ts` (starts the app, Chromium only), the `test:e2e` script, and a skeleton test `tests/e2e/smoke.spec.ts` that loads `/`
- [ ] T005 [P] Add `.env.example` listing exactly the four names in [contracts/environment.md](contracts/environment.md) (no values), and confirm `.gitignore` excludes `.env*` except `.env.example`
- [ ] T006 Add `@opennextjs/cloudflare` 1.20 and Wrangler 4: `wrangler.jsonc`, `open-next.config.ts`, and scripts `build:worker`, `preview:worker`, `deploy:worker`. `npm run build:worker` must succeed locally
- [ ] T007 Prove the session hook works on OpenNext (research R3): add a pass-through `src/proxy.ts`, run `npm run build:worker` and `npm run preview:worker`. If OpenNext rejects Node proxy, switch to an edge `src/middleware.ts`. Add a dated outcome note under R3 in `specs/001-mvp/research.md`

### CI, previews, branch rules

- [ ] T008 Add `.github/workflows/ci.yml` triggered on pull requests and pushes to `main`, with jobs `lint`, `typecheck`, `unit`, `build` (`npm run build:worker`) and `e2e` (Playwright). Node 24, `npm ci`, npm cache. The `build` job sets placeholder `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` values (local-stack defaults, not secrets) because those are inlined at build time once T054 lands
- [ ] T009 [P] Add `.github/pull_request_template.md` with a `Closes #` line, a checklist (lint, typecheck, tests, build pass; matrix rows covered) and a "no secrets" reminder (Constitution II and IV)
- [ ] T010 🧑 manual: create the Cloudflare Workers project through Workers Builds linked to the GitHub repo, turn on non-production branch builds, and deploy the skeleton. Record the production URL and the skeleton page's CPU time in `specs/001-mvp/research.md` under R1 "Watch". Needs T006 and T008 merged
- [ ] T011 🧑 manual: open a draft PR from a throwaway branch and confirm Workers Builds posts a preview URL on it, and that the preview loads. Note the result in `docs/journey/JOURNAL.md` via the `session-journal` skill (no code change)

### Database pipeline (walking skeleton)

- [ ] T012 Run `npx supabase init`; pin the `supabase` CLI as a devDependency. In `supabase/config.toml` set `enable_signup = false` for auth, keep local mail on Mailpit, and add the scripts `db:start`, `db:reset`, `db:test` (`supabase test db`), `db:lint` (`supabase db lint`) to `package.json`
- [ ] T013 [P] Create `supabase/tests/00_helpers.sql`: pgTAP setup plus helpers `tests.as_anon()` and `tests.as_authenticated(uid uuid)` that switch role and set `request.jwt.claims`. The file must also pass when run as a test. (User-creating helpers come in T027, once `profiles` exists)
- [ ] T014 Write `supabase/tests/row25_health.sql` (row 25): `health()` returns true for anon, for an authenticated user with a profile-less uid, and for any other role. Run it and confirm it fails
- [ ] T015 Add migration `*_health.sql`: `health()` returns `true`, `security definer`, `set search_path = ''`, executable by `anon` and `authenticated`, touches no tables. T014 must now pass
- [ ] T016 Add a `db` job to `.github/workflows/ci.yml`: `supabase/setup-cli`, `supabase start`, `supabase db lint`, `supabase test db`. A failing or skipped test fails the job (SC-005)
- [ ] T017 🧑 manual: create the hosted Supabase project; turn off sign-ups in Auth settings; add the GitHub Actions secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`. Add the repo variable `SUPABASE_PUBLISHABLE_KEY` (a publishable key is safe to expose, but keep it out of the workflow file). Also set the Workers Builds variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`) so preview builds keep working once T054 adds the Supabase clients. Never put the secret key in the repo
- [ ] T018 Add `.github/workflows/deploy-db.yml`: on push to `main`, run `supabase link` + `supabase db push` using the T017 secrets. It must be a no-op when there are no new migrations
- [ ] T019 Add `.github/workflows/keepalive.yml`: cron every 3 days plus `workflow_dispatch`, calls `POST /rest/v1/rpc/health` on the hosted project with the publishable key and fails on any non-200 (research R11). Add the new names (`SUPABASE_PUBLISHABLE_KEY` variable, the `NEXT_PUBLIC_*` mapping used by Workers Builds) to the CI table in [contracts/environment.md](contracts/environment.md)

### Agent workflows and gates

- [ ] T020 Add `.github/workflows/claude.yml`: `@claude` on an issue or PR comment runs the Claude GitHub Action, creates a branch and opens a PR. Authenticate with the existing Claude subscription token stored as a secret. **Ask Sam before using a paid API key** (Constitution I). Restrict it to repository collaborators
- [ ] T021 Add `.github/workflows/claude-review.yml`: a Claude review pass that comments on each PR. Same authentication and cost rule as T020
- [ ] T022 🧑 manual: turn on branch protection for `main`: required status checks `lint`, `typecheck`, `unit`, `build`, `e2e`, `db`; at least one human approval; no direct pushes. Needs the checks from T008 and T016 to have run once
- [x] T023 🧑 manual: dry run. Create one tiny issue (for example a footer line on `src/app/page.tsx`), comment `@claude`, review the PR and its preview URL, merge, and confirm production redeploys. Record time and problems in the journal

**Checkpoint**: skeleton deployed on Workers, CI and preview per PR work, `health()` deploys to hosted Supabase and the keep-alive runs, agent PRs are gated. Phase 2 can start.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, role helpers, reference data, policies for the shared tables, test helpers, and the app plumbing every story uses (plan "slice 1": matrix rows 1–9).

**⚠️ CRITICAL**: no user story starts until this phase is complete.

### Schema

- [ ] T024 Add migration `*_enums_and_reference.sql`: `btree_gist` extension, enums `app_role` and `request_status`, tables `holiday_regions`, `public_holidays`, `leave_types` exactly as in [data-model.md](data-model.md) (constraints, FKs `on delete restrict`, unique `(region_code, holiday_date)`). Enable RLS on each table and add no policies yet
- [ ] T025 Add migration `*_profiles.sql`: `profiles` per data-model.md (FK to `auth.users` on delete cascade, lower-cased unique email, `check (not is_demo or role = 'employee')`, IANA timezone check trigger with default from the region). Enable RLS. Revoke table-level update from `authenticated` and grant update on `(region_code, timezone)` only
- [ ] T026 Add migration `*_requests_and_allowances.sql`: `leave_requests` (all checks, `decided_by <> user_id`, `btree_gist` exclusion on pending/approved overlap), `allowance_overrides`, `allowance_changes` (identity PK, no client write grants). Enable RLS on each, no policies yet

### pgTAP helpers and invariants

- [x] T027 Extend `supabase/tests/00_helpers.sql` with `tests.create_user(role app_role, region text default 'QLD', active boolean default true, demo boolean default false)` returning the uid (inserts into `auth.users` and `profiles`), and `tests.create_request(...)` that inserts a `leave_requests` row directly as superuser for fixtures
- [x] T028 [P] Write `supabase/tests/rls_enabled.sql`: every table in `public` has RLS enabled and no table grants write access to `anon`. (Also covered by `supabase db lint` in CI)
- [x] T029 [P] Write `supabase/tests/whoami.sql`: `whoami()` returns the profile for each role; returns null for an inactive user, for an authenticated user with no profile, and for anon. Confirm it fails
- [x] T030 Add migration `*_private_helpers.sql`: schema `private` (not exposed), `private.current_role()`, `private.is_admin()`, `private.is_approver()` (null role for no profile or inactive), and `whoami()`. T029 must now pass

### Reference seed

- [x] T031 [P] Write `supabase/tests/seed_reference.sql`: regions QLD, NSW, HK exist with valid timezones; leave types Annual (20), Personal/Sick (10) and Unpaid (uncapped); each region has holidays for 2026 and 2027; the QLD list includes the Brisbane Show (Ekka) day. Confirm it fails
- [x] T032 Add migration `*_seed_reference.sql` (idempotent, `on conflict do nothing`): the three regions and three leave types
- [x] T033 [P] Add migration `*_seed_holidays_qld.sql`: QLD public holidays for 2026 and 2027 from the official Queensland government list, including Ekka. Cite the source in a header comment (ADR 0008)
- [x] T034 [P] Add migration `*_seed_holidays_nsw.sql`: NSW statutory public holidays for 2026 and 2027, with the source cited
- [x] T035 [P] Add migration `*_seed_holidays_hk.sql`: Hong Kong general holidays for 2026 and 2027, with the source cited

### Access matrix rows 1–9 (tests first)

- [x] T036 [P] Write `supabase/tests/row01_profiles_select.sql` (row 1): E, M, A can select profiles; an inactive user and anon get none or an error
- [x] T037 [P] Write `supabase/tests/row02_profiles_update_own.sql` (row 2): each role can update only their own `region_code` and `timezone`; updating someone else's row or an inactive user's own row changes nothing; anon refused; an invalid timezone is rejected
- [x] T038 [P] Write `supabase/tests/row03_profiles_protected_columns.sql` (row 3): no role, including admin, can update `role`, `is_active`, `is_demo` or `email` directly; also not by inserting or deleting
- [x] T039 [P] Write `supabase/tests/row04_admin_people_rpcs.sql` (row 4): admin can call `admin_create_profile`, `admin_update_user`, `admin_set_active` (an admin cannot change their own role or deactivate themselves); E, M, inactive and anon are refused with `not_allowed`; `profile_exists` when a profile is already there
- [x] T040 [P] Write `supabase/tests/row05_admin_set_demo_active.sql` (row 5): admin can call it and gets the demo ids back; every other role is refused; real profiles are untouched
- [x] T041 [P] Write `supabase/tests/row06_leave_types_select.sql` (row 6): E, M, A can select; inactive and anon cannot
- [x] T042 [P] Write `supabase/tests/row07_leave_types_write.sql` (row 7): admin can insert and update, nobody can delete; E, M, inactive and anon are refused
- [x] T043 [P] Write `supabase/tests/row08_holidays_select.sql` (row 8): `holiday_regions` and `public_holidays` readable by E, M, A; not by inactive or anon
- [x] T044 [P] Write `supabase/tests/row09_holidays_write.sql` (row 9): admin can write regions and holidays; E, M, inactive, anon are refused; deleting a region in use is refused (`restrict`)

### Policies and admin RPCs

- [x] T045 Add migration `*_policies_profiles.sql`: select policy for active users; update policy and column grant for own `region_code` and `timezone`; no insert or delete policies. Rows 1–3 tests (T036–T038) must pass
- [x] T046 Add migration `*_policies_reference.sql`: select for active users and admin-only writes on `leave_types` (no delete), `holiday_regions` (no delete) and `public_holidays`. Rows 6–9 tests (T041–T044) must pass
- [x] T047 Add migration `*_admin_people_rpcs.sql`: `admin_create_profile`, `admin_update_user`, `admin_set_active` per [database-api.md](contracts/database-api.md), with the error codes listed there. Row 4 test (T039) must pass
- [x] T048 Add migration `*_admin_set_demo_active.sql`: `admin_set_demo_active(p_active)` returning the affected demo ids. Row 5 test (T040) must pass
- [x] T049 Add the `types:gen` script and generate `src/lib/database.types.ts`; commit it

### App plumbing

- [x] T050 [P] Write `tests/unit/dates.test.ts`: plain-date formatting as `ddd d MMM yyyy` with no day shift in any timezone, "today" in `Asia/Hong_Kong` vs `Australia/Brisbane` near midnight, and the leave year for a given instant and timezone. Confirm it fails
- [x] T051 Implement `src/lib/dates.ts` to pass T050 (`Intl.DateTimeFormat('en-AU', { timeZone })`, no date library)
- [x] T052 [P] Write `tests/unit/errors.test.ts`: a database error with `message = '<code>'` becomes `{ ok: false, code, message }` with the copy for that code; unknown codes give the generic message; the success shape is `{ ok: true, data }`. Confirm it fails
- [x] T053 Implement `src/lib/errors.ts`: the `ActionResult<T>` type, `toActionResult`, and a code-to-copy map seeded with `not_allowed`, `not_found`, `profile_exists`, `cannot_change_own_role`, `cannot_deactivate_self`, `demo_must_be_employee`. Later phases add their own codes
- [x] T054 [P] Create `src/lib/supabase/browser.ts` and `src/lib/supabase/server.ts` (`@supabase/ssr` cookie clients, publishable key only) and make `src/proxy.ts` (or `src/middleware.ts`, per T007) refresh the session. Server code reads the user with `auth.getUser()`, never `getSession()` alone (research R3)
- [x] T055 [P] Create `src/server/supabase-admin.ts` (`import 'server-only'`, secret-key client) and `src/server/auth.ts` (`getViewer()` calling `whoami()`; `assertAdmin(client)` holding the logic, and `requireAdmin()` wrapping it for Server Actions; both return the viewer or throw `not_allowed`)
- [x] T056 [P] Implement the "Ledger" tokens and fonts from [DIRECTION.md](../../docs/design/DIRECTION.md) in `src/app/globals.css` and `src/app/layout.tsx` (IBM Plex via `next/font`, colour/spacing tokens as CSS variables, no invented values)
- [x] T057 [P] Create `src/components/badges.tsx` with `StatusBadge` (Pending with clock, Approved with check, Declined with x), `DemoBadge` and `InactiveBadge`, always with a text label and a Lucide icon (FR-025). Add `tests/unit/badges.test.tsx` that renders each with `react-dom/server` and asserts the label text
- [x] T058 [P] Write `tests/unit/local-guard.test.ts` for `isLocalSupabaseUrl()` in `scripts/lib/local-guard.ts` (true for `127.0.0.1`/`localhost`, false for any `*.supabase.co`). Confirm it fails
- [x] T059 Implement `scripts/lib/local-guard.ts` and `scripts/seed-local.ts` (`npm run seed:local`): refuses a non-local URL, then creates a local admin, a manager and two employees through the auth admin API and inserts their `profiles` rows directly with the secret key (`admin_create_profile` needs an admin session, which doesn't exist yet). The password comes from a `--password` flag or a prompt, never from a committed file. Tests and e2e read it from `E2E_PASSWORD`, a test-only variable set in the shell or CI (not an app variable, so not in `.env.example`). Add the script to `package.json`

**Checkpoint**: schema, helpers, seed, rows 1–9 and 25 green in `supabase test db`; clients and tokens in place. User stories can start.

---

## Phase 3: User Story 1 — Sign in and see my balances (Priority: P1) 🎯 MVP

**Goal**: an invited user sets a password, signs in, and sees name, role and balances; the admin can invite and deactivate people (plan slices 2 and 3).

**Independent Test**: seed one employee with allowances and some approved and pending leave, sign in, and check each balance against a manual calculation. A wrong password and a deactivated account are both refused.

### Tests for User Story 1 (write first, confirm they fail)

- [x] T060 [P] [US1] Set up integration tests: `vitest.integration.config.ts`, `npm run test:integration`, and `tests/integration/helpers.ts` (client factories for anon, a signed-in user and the secret key against the local stack; create and clean up users; refuses a non-local URL; aliases `server-only` to an empty stub so `src/server/*` modules can be imported under Vitest)
- [x] T061 [P] [US1] Write `tests/integration/auth.test.ts`: a banned or deactivated user cannot sign in; a wrong password and an unknown email give the same error; `inviteUser` from `src/server/admin-users.ts` deletes the auth user when `admin_create_profile` fails (compensation); `setUserActive` bans and unbans (FR-001, FR-004, US1-2, US1-4)
- [x] T062 [P] [US1] Write `tests/unit/schemas-auth.test.ts`: sign-in needs an email and a non-empty password; set-password needs at least 10 characters; password reset takes an email only
- [x] T063 [P] [US1] Write `tests/e2e/fixtures.ts` (log in as a seeded user from `seed:local`) and `tests/e2e/signin.spec.ts`: a correct sign-in reaches the dashboard with name and role; a wrong password shows the generic error; a deactivated user is refused (US1-1, US1-2, US1-4)
- [x] T064 [P] [US1] Write `supabase/tests/row20_get_balances_scope.sql` (row 20): a user can call `get_balances` for themselves; E for another user is refused; M and A can for anyone; inactive and anon are refused
- [x] T065 [P] [US1] Write `supabase/tests/row21_allowance_overrides_select.sql` (row 21): E sees own overrides only; M and A see all; inactive and anon see none
- [x] T066 [P] [US1] Write `supabase/tests/row22_admin_set_allowance.sql` (row 22): admin can set and remove an override on a capped type and one log row is written each time (old, new, caller, reason); E, M, inactive, anon are refused; an uncapped type raises `type_uncapped`
- [x] T067 [P] [US1] Write `supabase/tests/row23_allowance_changes_select.sql` (row 23): E sees own rows plus default-change rows (`user_id` null) and not others'; M and A see all; inactive and anon see none
- [x] T068 [P] [US1] Write `supabase/tests/row24_allowance_changes_no_direct_write.sql` (row 24): nobody, including admin, can insert, update or delete `allowance_changes`, and nobody can write `allowance_overrides` directly
- [x] T069 [P] [US1] Write `supabase/tests/balances_behaviour.sql`: US1-3 (20 allowance, 3 approved, 2 pending gives available 15, taken 3, pending 2); an override replaces the default; uncapped types return null allowance and available; retired types appear only when they have requests that year; negative available after an allowance cut; declined requests never count

### Implementation: auth and roles

- [x] T070 [P] [US1] Add `supabase/templates/invite.html` and `supabase/templates/recovery.html` with `{{ .TokenHash }}` links to `/auth/confirm?token_hash=…&type=…&next=/set-password`, and wire them (plus `site_url` and redirect URLs) in `supabase/config.toml`
- [x] T071 [US1] Add the auth zod schemas to `src/lib/schemas.ts` and the actions in `src/actions/auth.ts`: `signIn` (any failure returns `invalid_credentials`), `signOut`, `requestPasswordReset` (always `ok`), `setPassword`. Extend `src/lib/errors.ts` with `invalid_credentials`. T062 must pass
- [x] T072 [P] [US1] Create the route handler `src/app/auth/confirm/route.ts`: `verifyOtp({ token_hash, type })`, then redirect to `next` (same-origin paths only) (FR-003, FR-006)
- [x] T073 [P] [US1] Create `src/app/(auth)/sign-in/page.tsx`: email and password form, generic error, "Forgot password" link (FR-001)
- [x] T074 [P] [US1] Create `src/app/(auth)/forgot-password/page.tsx`: email form that always shows the same confirmation (FR-006)
- [x] T075 [P] [US1] Create `src/app/(auth)/set-password/page.tsx`: new password form (min 10 characters) for an invited or reset session
- [x] T076 [US1] Create `src/app/(app)/layout.tsx` and `src/components/nav.tsx`: redirect to `/sign-in` without a session; call `getViewer()`; if the profile is missing or inactive, sign out and redirect; navy sidebar on desktop, top bar and bottom tabs on mobile; links by role (Approvals for M and A; Admin for A)
- [x] T077 [P] [US1] Create `src/components/forbidden.tsx` (403 page) and `src/app/(app)/admin/layout.tsx` that renders it for non-admins (US6-5)
- [x] T078 [US1] Create `src/server/admin-users.ts` (`import 'server-only'`): `inviteUser(clients, input)` calls `auth.admin.inviteUserByEmail` then `admin_create_profile`, deleting the auth user if the second step fails; `setUserActive(clients, id, active)` calls `admin_set_active` then bans (`876000h`) or unbans (`none`). T061 must pass
- [x] T079 [US1] Create `src/actions/admin-users.ts` with `inviteUser` and `setUserActive` Server Actions: `requireAdmin()` first, zod-parse, call T078, return `ActionResult`
- [x] T080 [US1] Create a minimal `src/app/(app)/admin/users/page.tsx`: list name, role, region and an Inactive badge; invite form; deactivate and reactivate buttons (FR-004, FR-027, US6-1, US6-2; role and region edits come in Phase 8)

### Implementation: balances

- [x] T081 [US1] Add migration `*_balances.sql`: `private.available_balance(p_user, p_type, p_year)` and `get_balances(p_user_id, p_year)` per database-api.md. Row 20 and `balances_behaviour` tests (T064, T069) must pass
- [x] T082 [US1] Add migration `*_policies_allowances.sql`: select policies for `allowance_overrides` and `allowance_changes`; no write policies. Rows 21, 23, 24 tests (T065, T067, T068) must pass
- [x] T083 [US1] Add migration `*_admin_set_allowance.sql`: `admin_set_allowance` (upsert or delete, plus one `allowance_changes` row in the same transaction). Row 22 test (T066) must pass
- [x] T084 [US1] Regenerate `src/lib/database.types.ts` (`npm run types:gen`)
- [x] T085 [P] [US1] Create `src/components/balances.tsx`: one row per leave type with allowance, taken, pending, available; uncapped types show days taken and pending only; a negative available shows "−2 days (over)" in the warning style with text, not colour alone
- [x] T086 [P] [US1] Create `src/components/allowance-log.tsx`: a table of log entries with old value, new value, who, when, reason
- [x] T087 [US1] Create `src/app/(app)/page.tsx` (dashboard): name, role, balances for the current leave year in the viewer's timezone (`getViewer()` + `get_balances` + `src/lib/dates.ts`), and the viewer's own allowance log section (FR-010, FR-008a, US1-1, US1-3)

### Verification and hosted setup

- [x] T088 [US1] Write `tests/e2e/balances.spec.ts`: seed an employee with approved and pending leave, sign in, and assert the shown balances match the hand calculation (extends T063's fixtures)
- [x] T089 [US1] Update the `e2e` job and add an `integration` job in `.github/workflows/ci.yml`: start the local Supabase stack, run `npm run seed:local` with a generated password exported as `E2E_PASSWORD`, then `npm run test:e2e` and `npm run test:integration`. Once it has run, Sam adds `integration` to the required checks from T022
- [ ] T090 🧑 manual: finish hosted auth. Add Brevo SMTP (host, port 587, login, SMTP key, verified sender) in Supabase Auth, set the Site URL and redirect allow-list (production URL and `*.workers.dev`), paste the invite and recovery templates from T070, and set the `SUPABASE_SECRET_KEY` Worker secret (the `NEXT_PUBLIC_*` variables were set in T017). Write `docs/ops/BOOTSTRAP.md` explaining how the first admin is created on the hosted project (a dashboard-created auth user plus one SQL insert into `profiles`, run by Sam; no secrets or real emails in the file)
- [ ] T091 🧑 manual: deployed smoke check on the PR preview: `/sign-in` loads, an invite email arrives through Brevo, setting a password signs the user in (quickstart "Deployed smoke check")

**Checkpoint**: US1 works end to end locally and on the preview. This is the first shippable slice: it already replaces the balance spreadsheet.

---

## Phase 4: User Story 2 — Request leave (Priority: P1)

**Goal**: pick a type and dates, see the working-day count for your own region before submitting, and submit a pending request that holds days against the balance (plan slice 4).

**Independent Test**: as a Brisbane employee, request a range with a QLD-only holiday; the count excludes it and the weekend, and the request shows as Pending with the balance reduced.

### Tests for User Story 2 (write first, confirm they fail)

- [ ] T092 [P] [US2] Write `supabase/tests/row10_leave_requests_select.sql` (row 10): E sees only own requests; M and A see all; inactive and anon see none
- [ ] T093 [P] [US2] Write `supabase/tests/row11_leave_requests_no_direct_write.sql` (row 11): no role can insert, update or delete `leave_requests` directly
- [ ] T094 [P] [US2] Write `supabase/tests/row12_submit_leave_request.sql` (row 12): E, M and A can submit for themselves; the row's `user_id` is always the caller; inactive and anon are refused; there is no way to submit for someone else
- [ ] T095 [P] [US2] Write `supabase/tests/count_working_days.sql`: the QLD-versus-NSW week gives 4 versus 5 (US2-1, US2-2); an HK-only holiday is skipped only for HK; a weekend-only range gives 0; a range that starts or ends on a weekend or holiday; single-day ranges; hand-calculated expected values (SC-004)
- [ ] T096 [P] [US2] Write `supabase/tests/request_validation.sql`: `invalid_range`, `spans_years`, `no_working_days`, `overlap` with a pending and with an approved request (a declined one does not block), `type_inactive`, `note_too_long`; past dates are allowed; `preview_leave_request` reports the same problems in `errors[]` instead of raising
- [ ] T097 [P] [US2] Write `supabase/tests/request_stored_values.sql`: `working_days` and `region_code` are stored at submission; they stay unchanged after a holiday edit or removal and after the user's region changes; `over_balance_days` is set when over and null when not or when uncapped; available drops by the pending days (US2-3, US2-6)
- [ ] T098 [P] [US2] Write `tests/integration/concurrent-submit.test.ts`: two parallel `submit_leave_request` calls for overlapping dates give exactly one success and one `overlap`
- [ ] T099 [P] [US2] Write `tests/unit/schemas-requests.test.ts` for the request input schema: valid ISO dates only, note up to 500 characters, type id is a uuid
- [ ] T100 [P] [US2] Write `tests/e2e/requests.spec.ts`: a QLD employee previews the Ekka week (4 days), submits, sees Pending in `/requests` with the balance reduced; a weekend-only range and an overlap are blocked; an over-balance request shows the warning and can still be submitted (SC-001)

### Implementation for User Story 2

- [ ] T101 [US2] Add migration `*_count_working_days.sql`: `private.count_working_days(p_region, p_start, p_end)` using `generate_series`, skipping Saturday, Sunday and the region's holidays. T095 must pass
- [ ] T102 [US2] Add migration `*_validate_and_preview.sql`: `private.validate_request(...)` shared by preview and submit, and `preview_leave_request`. T096 (preview parts) must pass
- [ ] T103 [US2] Add migration `*_submit_leave_request.sql`: `submit_leave_request` per database-api.md. T094, T096, T097 and T098 must pass
- [ ] T104 [US2] Add migration `*_policies_leave_requests.sql`: select policy (own rows, or all for M and A); no write policies or grants. Rows 10 and 11 tests (T092, T093) must pass
- [ ] T105 [US2] Regenerate `src/lib/database.types.ts`
- [ ] T106 [US2] Add the request zod schema to `src/lib/schemas.ts` and the codes `invalid_range`, `spans_years`, `no_working_days`, `overlap`, `type_inactive`, `note_too_long` to `src/lib/errors.ts`; then create `src/actions/requests.ts` with `previewLeaveRequest` and `submitLeaveRequest`. T099 must pass
- [ ] T107 [US2] Create `src/components/request-form.tsx`: type, start, end, note; a debounced live preview of working days, available balance and over-balance warning; blocking errors listed in plain words (FR-012–FR-014). Usable at phone width
- [ ] T108 [US2] Create `src/app/(app)/requests/new/page.tsx` using the form and the active leave types
- [ ] T109 [P] [US2] Create `src/app/(app)/requests/page.tsx`: my requests with dates, type, working days, `StatusBadge`, decider name and comment, newest first (FR-016, FR-020, US2-7)
- [ ] T110 [US2] Add an "Upcoming leave" section to `src/app/(app)/page.tsx` showing the viewer's pending and approved requests from today (viewer timezone)

**Checkpoint**: T100 passes. US1 and US2 together let a person see a balance and spend it.

---

## Phase 5: User Story 3 — Approve or decline requests (Priority: P1)

**Goal**: managers and admins decide pending requests with a comment, nobody decides their own, and decisions are final (plan slice 5).

**Independent Test**: submit as an employee and as the manager; the manager can decide only the employee's, the admin can decide both, and nobody can decide their own.

### Tests for User Story 3 (write first, confirm they fail)

- [ ] T111 [P] [US3] Write `supabase/tests/row13_decide_employee_request.sql` (row 13): M and A can decide an employee's request; E, inactive and anon are refused
- [ ] T112 [P] [US3] Write `supabase/tests/row14_decide_manager_request.sql` (row 14): A can decide a manager's request; M deciding their own gets `own_request`; E, inactive and anon are refused
- [ ] T113 [P] [US3] Write `supabase/tests/row15_decide_admin_request.sql` (row 15): M can decide an admin's request; A deciding their own gets `own_request`; E, inactive and anon are refused
- [ ] T114 [P] [US3] Write `supabase/tests/row16_decide_already_decided.sql` (row 16): a second decision on an approved or declined request gets `already_decided` from every role
- [ ] T115 [P] [US3] Write `supabase/tests/row17_approval_queue.sql` (row 17): M sees pending E and A requests and not their own; A sees pending E and M requests and not their own; E, inactive and anon are refused; decided requests never appear
- [ ] T116 [P] [US3] Write `supabase/tests/decision_behaviour.sql`: approve records `decided_by`, `decided_at`, `decision_comment` and moves days from pending to taken (US3-1); decline returns the days and keeps the comment (US3-2); `invalid_outcome`; `not_found`; `approval_queue.available_now` and the over-balance flag are right (FR-021)
- [ ] T117 [P] [US3] Write `tests/integration/concurrent-decide.test.ts`: two parallel `decide_leave_request` calls give one success and one `already_decided`
- [ ] T118 [P] [US3] Write `tests/e2e/approvals.spec.ts`: the manager sees an employee's over-balance request in `/approvals`, approves it; the employee then sees Approved and taken increased; an employee who opens `/approvals` gets the 403 page (SC-002)

### Implementation for User Story 3

- [ ] T119 [US3] Add migration `*_decide_leave_request.sql`: `decide_leave_request` per database-api.md using `update … where id = p_request_id and status = 'pending'`. T111–T114, T116 and T117 must pass
- [ ] T120 [US3] Add migration `*_approval_queue.sql`: `approval_queue()` per database-api.md. T115 must pass
- [ ] T121 [US3] Regenerate `src/lib/database.types.ts`
- [ ] T122 [US3] Add the codes `invalid_outcome`, `own_request`, `already_decided` to `src/lib/errors.ts`, the decision zod schema to `src/lib/schemas.ts`, and `decideLeaveRequest` in `src/actions/requests.ts`
- [ ] T123 [US3] Create `src/app/(app)/approvals/page.tsx`: the `approval_queue()` table (requester with `DemoBadge`, type, dates, working days, note, available now, "over balance by N days" flag), approve and decline with an optional comment; employees get the 403 page (FR-021, US3-6)
- [ ] T124 [US3] Show the requester's allowance log (reuse `src/components/allowance-log.tsx`) under each queue row in `src/app/(app)/approvals/page.tsx` (FR-008a)
- [ ] T125 [US3] Add a pending-approvals count for M and A to `src/app/(app)/page.tsx` that links to `/approvals`

**Checkpoint**: T118 passes. The core flow (request, decide, balance moves) is closed.

---

## Phase 6: User Story 4 — Team calendar across regions (Priority: P2)

**Goal**: a month calendar of who is away, with each region's holidays, that respects colleague privacy (plan slice 6).

**Independent Test**: with seeded leave and holidays for all three regions, every leave entry and holiday appears on the right days labelled by region.

### Tests for User Story 4 (write first, confirm they fail)

- [ ] T126 [P] [US4] Write `supabase/tests/row18_team_calendar_rows.sql` (row 18): E, M, A get rows; inactive and anon are refused; a range over 62 days raises `invalid_range`
- [ ] T127 [P] [US4] Write `supabase/tests/row19_team_calendar_privacy.sql` (row 19): `leave_type_name` is null for an E looking at others and filled for the requester, M and A; notes and decision comments are never in the result
- [ ] T128 [P] [US4] Write `supabase/tests/team_calendar_behaviour.sql`: pending and approved rows overlapping the range are returned and declined are not (US4-4); leave of a deactivated user is returned with `is_active = false`; partial overlaps at the edges of the range
- [ ] T129 [P] [US4] Write `tests/unit/calendar.test.ts` for `src/lib/calendar.ts`: month grid bounds and weekday columns, previous and next month, holidays mapped per region and date, people grouped by region, leave spans clipped to the month

### Implementation for User Story 4

- [ ] T130 [US4] Add migration `*_team_calendar.sql`: `team_calendar(p_from, p_to)` per database-api.md. T126–T128 must pass
- [ ] T131 [US4] Regenerate `src/lib/database.types.ts`
- [ ] T132 [US4] Implement `src/lib/calendar.ts` to pass T129
- [ ] T133 [US4] Create `src/components/calendar-grid.tsx`: people as rows grouped by region, holiday columns labelled by region, Pending and Approved with different label and icon (FR-025), `DemoBadge` and `InactiveBadge`, horizontally scrollable at phone width
- [ ] T134 [US4] Create `src/app/(app)/calendar/page.tsx` for `/calendar?month=YYYY-MM`: reads `team_calendar`, active and inactive people with leave from `profiles`, and `public_holidays`; previous and next month links; defaults to the viewer's current month in their timezone (US4-1 to US4-5)

**Checkpoint**: the calendar answers "who is away on date X, and is it a holiday in QLD, NSW or HK?" (SC-003).

---

## Phase 7: User Story 5 — My profile: holiday region and timezone (Priority: P2)

**Goal**: each user sets their region and timezone, and new requests and displayed dates follow them (plan slice 6).

**Independent Test**: change a user's region from NSW to QLD; a new request over a QLD-only holiday now excludes that day, and existing requests keep their counts.

### Tests for User Story 5 (write first, confirm they fail)

- [ ] T135 [P] [US5] Write `supabase/tests/profile_region_change.sql`: after a user changes their own region, a new request is counted with the new region and an existing request keeps its stored count (US5-2); an invalid timezone or unknown region is rejected
- [ ] T136 [P] [US5] Write `tests/unit/schemas-profile.test.ts`: region must be a code from the regions list, timezone must be a valid IANA name (`Intl.supportedValuesOf('timeZone')`)
- [ ] T137 [P] [US5] Write `tests/e2e/profile.spec.ts`: change region and timezone on `/profile`, reload, and see them saved; the dashboard date follows the new timezone

### Implementation for User Story 5

- [ ] T138 [US5] Add the profile zod schema to `src/lib/schemas.ts` and `src/actions/profile.ts` with `updateProfile(region, timezone)` (a `profiles` update of the two permitted columns). T136 must pass
- [ ] T139 [US5] Create `src/app/(app)/profile/page.tsx`: region select from `holiday_regions`, timezone select, save (FR-023). T135 and T137 must pass

**Checkpoint**: counts follow the region and dates follow the timezone (FR-026).

---

## Phase 8: User Story 6 — Admin settings and demo data (Priority: P3)

**Goal**: the admin manages people, allowances, leave types and holidays without a developer, and can load fictional demo employees that pad the real team and never touch real data (plan slice 7). Invite and deactivate already shipped in Phase 3.

**Independent Test**: as admin, create a leave type, invite a user, override their allowance, add a holiday, then sign in as that user and see it all. Load the demo twice and check real rows are unchanged.

### Tests for User Story 6 (write first, confirm they fail)

- [ ] T140 [P] [US6] Write `supabase/tests/d1_demo_must_be_employee.sql` (D1): making a demo profile a manager or admin fails both by direct update and through `admin_update_user` (`demo_must_be_employee`)
- [ ] T141 [P] [US6] Write `supabase/tests/d2_demo_cannot_read_real_requests.sql` (D2): a demo employee reading `leave_requests` gets only their own rows, never a real colleague's
- [ ] T142 [P] [US6] Write `supabase/tests/d3_demo_team_calendar.sql` (D3): a demo employee calling `team_calendar` gets real and demo rows with `leave_type_name` null for others
- [ ] T143 [P] [US6] Write `supabase/tests/leave_type_default_log.sql`: changing `default_allowance` writes one `allowance_changes` row with `user_id` null (old, new, caller, time); renaming or retiring a type writes none (research R12, FR-008a)
- [ ] T144 [P] [US6] Write `tests/integration/demo-reset.test.ts` (D4, SC-007): snapshot every real `profiles`, `leave_requests`, `allowance_overrides` and `allowance_changes` row, call the T151 loader twice (not the Server Action), and assert the real rows are byte-identical
- [ ] T145 [P] [US6] Write `tests/integration/demo-disable.test.ts` (D5): the `setDemoActive` core function in `src/server/demo/` (T152 keeps the action a thin wrapper) leaves every demo user banned and `is_active = false` and no real user changed; `setDemoActive(true)` reverses it
- [ ] T146 [P] [US6] Write `tests/integration/admin-actions-refused.test.ts` (FR-005, US6-5): Server Actions can't run under Vitest, so test the layers they wrap: `assertAdmin(client)` throws `not_allowed` for an employee, a manager and an inactive session; and with those same user-scoped clients, every database operation behind an admin action (`admin_*` RPCs and the `leave_types`, `holiday_regions`, `public_holidays` writes) is refused
- [ ] T147 [P] [US6] Write `tests/unit/demo-roster.test.ts` for `src/server/demo/roster.ts`: employees only, spread across QLD, NSW and HK, requests in every status, all emails on a reserved fictional domain, no password literal anywhere in the module (FR-029, FR-031, FR-032)

### Implementation for User Story 6

- [ ] T148 [US6] Add migration `*_leave_type_default_log.sql`: the `after update` trigger on `leave_types` that logs default-allowance changes. T143 must pass
- [ ] T149 [US6] Regenerate `src/lib/database.types.ts`
- [ ] T150 [P] [US6] Create `src/server/demo/roster.ts`: the fictional demo employees and their requests (data only). T147 must pass
- [ ] T151 [US6] Create `src/server/demo/loader.ts` (`import 'server-only'`): delete existing demo auth users (cascades to their rows), create the roster with the supplied password, inserting each `profiles` row directly with the secret key (`is_demo = true`; `admin_create_profile` has no demo parameter), have each demo user sign in and submit through `submit_leave_request` so counts come from Postgres, and record the decisions through `decide_leave_request` using a signed-in admin client passed in as `decider` (the calling admin in the UI). Never reads or writes a non-demo row. T144 must pass
- [ ] T152 [US6] Create `src/actions/demo.ts` with `loadDemo(password)` (min 10 characters, never stored or logged) and `setDemoActive(active)`; both call `requireAdmin()` first and delegate to functions in `src/server/demo/` (`setDemoActive` core: `admin_set_demo_active`, then ban or unban each returned id) so they can be tested without Next.js. T145 must pass
- [ ] T153 [P] [US6] Create `scripts/demo-load.ts` and the `demo:load` npm script: prompts for the demo password and for the local admin's email and password (the `decider` for T151, normally the user created by `seed:local`), calls the T151 loader, and refuses a non-local Supabase URL through `scripts/lib/local-guard.ts`
- [ ] T154 [US6] Create `src/app/(app)/admin/demo/page.tsx`: load or reset demo data (password field), disable or enable all demo logins, and a short statement of what is touched (FR-029–FR-031)
- [ ] T155 [US6] Add `updateUser` to `src/actions/admin-users.ts` (calls `admin_update_user`), the role and region edit form to `src/app/(app)/admin/users/page.tsx`, and the `DemoBadge` on its rows (FR-027, US6-1)
- [ ] T156 [US6] Add `setAllowance` to a new `src/actions/allowances.ts` (calls `admin_set_allowance`, reason optional) with its zod schema
- [ ] T157 [US6] Create `src/app/(app)/admin/users/[id]/page.tsx`: allowances per leave type for a chosen year, an override form with reason, and the user's change log (reuse `allowance-log.tsx`) (FR-008, FR-008a, US6-3)
- [ ] T158 [US6] Add `saveLeaveType` to `src/actions/leave-types.ts` (insert or update on `leave_types`: create, rename, cap or uncap, default allowance, retire; no delete) with its zod schema
- [ ] T159 [US6] Create `src/app/(app)/admin/leave-types/page.tsx` listing types and the edit form (FR-007)
- [ ] T160 [US6] Add `saveRegion`, `saveHoliday`, `deleteHoliday` to `src/actions/holidays.ts` with zod schemas (region code `^[A-Z]{2,5}$`, valid IANA timezone, holiday name 1–80 characters)
- [ ] T161 [US6] Create `src/app/(app)/admin/holidays/page.tsx`: regions, then holidays per region and year with add, edit and remove; add a region (FR-028, US6-4). T146 must pass

**Checkpoint**: an admin runs the whole team from the app; the demo loads in under 5 minutes with real rows untouched.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: checks that span stories and the final end-to-end validation.

- [ ] T162 [P] Add `@axe-core/playwright` (free, open source) and `tests/e2e/a11y.spec.ts`: no serious or critical WCAG 2.1 AA violations on sign-in, dashboard, `/requests/new`, `/calendar` and `/approvals` (Constitution VI)
- [ ] T163 [P] Write `tests/e2e/mobile.spec.ts` with a 390 px viewport: the request form and the calendar are usable and the page has no horizontal scroll apart from the calendar grid
- [ ] T164 [P] Write `scripts/check-client-bundle.mjs` that fails if `sb_secret_`, `SUPABASE_SECRET_KEY` or `server-only` modules appear in the built client output, and run it after the build in `.github/workflows/ci.yml` (Constitution II and III)
- [ ] T165 [P] Update `README.md` with a short local setup that points to [quickstart.md](quickstart.md), and list the npm scripts
- [ ] T166 🧑 manual: on a preview URL, measure Worker CPU time for the dashboard, `/requests/new`, `/calendar` and `/approvals` with realistic data. Record the numbers in `specs/001-mvp/research.md` under R1. If any page is above 10 ms, open an issue to move work into Postgres
- [ ] T167 🧑 manual: run the full [quickstart.md](quickstart.md) walkthrough and the automated gates table end to end on a clean clone; open an issue for every gap
- [ ] T168 🧑 manual: run the "Deployed smoke check" in quickstart.md against production (sign-in loads, `health()` through keep-alive, Brevo invite arrives)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup & Pipeline)**: no dependencies; blocks everything. Inside it: T001 → T002–T006 → T007 → T008 → T010 → T011; T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019; T020 and T021 need T008; T022 needs T016; T023 needs T020–T022.
- **Phase 2 (Foundational)**: needs Phase 1. Schema (T024–T026) → helpers (T027) → role helpers (T030) → seed → rows 1–9 tests → policies and admin RPCs → types (T049) → plumbing. T050–T059 need only T001–T007 and T049.
- **Phases 3–8 (stories)**: need Phase 2.
- **Phase 9 (Polish)**: needs the stories it exercises.

### User story dependencies

- **US1** (Phase 3): after Phase 2. No other story needed.
- **US2** (Phase 4): needs US1 (sign-in, layout, `get_balances` for the available balance).
- **US3** (Phase 5): needs US2 (requests to decide).
- **US4** (Phase 6): needs Phase 2; its tests are richer with US2 and US3 data but use direct fixtures, so it can run in parallel with US3.
- **US5** (Phase 7): needs US1; its pgTAP test needs `submit_leave_request` from US2.
- **US6** (Phase 8): needs US1 (admin layout, users page, admin actions) and US2 + US3 (the demo loader submits and decides through the RPCs).

### Within each story

- Tests first, confirmed failing, then migrations, then types, then actions, then pages.
- Migrations in a story run in the order listed.
- A task marked "must pass" is done only when the test it names is green.

### Matrix coverage

| Rows | Test tasks | Code tasks |
|------|-----------|-----------|
| 1–3 | T036–T038 | T045 |
| 4, 5 | T039, T040 | T047, T048 |
| 6–9 | T041–T044 | T046 |
| 10, 11 | T092, T093 | T104 |
| 12 | T094 | T103 |
| 13–16 | T111–T114 | T119 |
| 17 | T115 | T120 |
| 18, 19 | T126, T127 | T130 |
| 20 | T064 | T081 |
| 21, 23, 24 | T065, T067, T068 | T082 |
| 22 | T066 | T083 |
| 25 | T014 | T015 |
| D1 | T140 | T025, T047 |
| D2, D3 | T141, T142 | T104, T130 |
| D4, D5 | T144, T145 | T151, T152 |

## Parallel Opportunities

- Phase 1: T002–T005 together; T009 alongside T008; T013 alongside T012's follow-ups.
- Phase 2: T028 and T029; T033–T035 (three holiday seeds); T036–T044 (nine row tests); T050/T052/T054/T055/T056/T057/T058.
- Every story: its pgTAP row tests, its integration tests and its e2e test are all `[P]` (different files).
- After Phase 3: US4 and US5 can run in parallel with US2 and US3 by different agents, as long as migration tasks are merged one at a time.

```bash
# Example: all Phase 5 tests in parallel (different files)
Task: "Write supabase/tests/row13_decide_employee_request.sql"
Task: "Write supabase/tests/row14_decide_manager_request.sql"
Task: "Write supabase/tests/row15_decide_admin_request.sql"
Task: "Write supabase/tests/row16_decide_already_decided.sql"
Task: "Write supabase/tests/row17_approval_queue.sql"
Task: "Write tests/integration/concurrent-decide.test.ts"
```

## Implementation Strategy

### MVP first

1. Phase 1 (pipeline) then Phase 2 (foundation).
2. Phase 3 (US1): stop and validate. Sam can invite the team and retire the balance spreadsheet.
3. Phases 4–5 (US2, US3): the core flow. Stop and validate; this is the minimum that replaces email requests.
4. Phases 6–7 (US4, US5), then Phase 8 (US6), then Phase 9.

### Incremental delivery

Every phase ends in a checkpoint that can be merged, deployed to the preview and demonstrated. Each task is one branch (`feat/…`, `chore/…`, `docs/…`) and one PR with `Closes #N`; no direct pushes to `main` once T022 is done.

## Notes

- `[P]` tasks touch different files. Two tasks that edit the same file (`src/lib/schemas.ts`, `src/lib/errors.ts`, `src/actions/requests.ts`, `src/app/(app)/page.tsx`) are never `[P]` against each other.
- Commit after each task. Never commit secrets, `.env*` files or real personal data (Constitution II).
- No task adds a service or dependency with a cost. `@axe-core/playwright` (T162) is free and open source.

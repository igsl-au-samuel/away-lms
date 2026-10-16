# Quickstart: validate the Away MVP

This is how to prove the MVP works end to end, locally and in CI. It covers running
and checking only. The build steps live in `tasks.md`.

## Prerequisites

- Node 24 LTS, npm 11, Git Bash (Windows)
- **Docker Desktop** running (for the local Supabase stack, ADR 0005)
- Supabase CLI, via `npx supabase` (a pinned devDependency)
- No cloud accounts are needed locally. Brevo, Cloudflare and the hosted Supabase
  project are only for deployment.

## Local setup

```bash
npm ci
npx supabase start             # Postgres, Auth, Studio, Mailpit
npx supabase db reset          # migrations + reference seed (regions, types, holidays)
cp .env.example .env.local     # fill from `npx supabase status`
npm run dev
```

## Automated gates (the same commands CI runs)

| Command | Proves | Expected |
|---------|--------|----------|
| `npm run lint` · `npm run typecheck` | Code quality | 0 errors |
| `npm test` | Unit tests (date/timezone helpers, calendar grid, input schemas) | all pass |
| `npx supabase test db` | Every row of [access-matrix.md](contracts/access-matrix.md) (allowed and refused), working-day and balance cases | all pass, 0 skipped |
| `npx supabase db lint` | No table without RLS, no mutable search_path | no errors |
| `npm run test:integration` | 🔑 actions: invite, deactivate ban, demo load/reset/disable (D4, D5) | all pass |
| `npm run test:e2e` | Playwright smoke tests for US1–US3 | all pass |
| `npm run build:worker` | OpenNext build for Workers | succeeds |

## Manual walkthrough (about 10 minutes)

First run `npm run seed:local`, which creates a local admin and manager and refuses
to run against any non-local Supabase URL. Then run `npm run demo:load`, which asks
for a demo password and creates the demo employees. Emails go to Mailpit
(`http://127.0.0.1:54324`).

1. **US1 Balances:** sign in as a demo employee. The dashboard balances match the
   seeded leave. A wrong password shows the generic error.
2. **US2 Request:** as a QLD demo employee, open `/requests/new` for the Ekka week.
   The preview shows 4 days. Switch the profile to NSW and the same week shows 5.
   Submit, and it shows as Pending with available reduced. Try a weekend only, then an
   overlap: both are blocked. Go over balance: a warning, but it can still be
   submitted.
3. **US3 Approve:** sign in as the manager. `/approvals` lists the request with its
   over-balance flag. Approve it. The employee sees Approved, and taken goes up.
   Decide it again and the UI shows "already decided".
4. **US4 Calendar:** `/calendar` for that month shows Approved and Pending labels,
   QLD/NSW/HK holidays by region, and "Demo" badges. As an employee, colleagues'
   leave types aren't visible.
5. **US5 Profile:** change the timezone to Asia/Hong_Kong. "Today" follows it.
6. **US6 Admin:** invite a user. The invite email arrives in Mailpit, and setting a
   password activates the account. Override an allowance with a reason, and the change
   log shows old, new, who, when and why. Add a holiday. Deactivate the user, and
   sign-in is refused. In `/admin/demo`, disable demo logins: demo sign-in is
   refused, and real accounts still work.
7. **SC-007:** run `npm run demo:load` again. Real users' requests and allowances are
   unchanged (test D4 checks the same thing automatically).

## Deployed smoke check (once Phase 2 is set up)

The PR preview URL from Workers Builds loads `/sign-in`. `health()` returns true
through the keep-alive workflow. An invite email arrives through Brevo.

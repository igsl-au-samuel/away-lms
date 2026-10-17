# Manual steps: T166–T168 (for Sam)

These three need your accounts and your hands. The agent must not touch Cloudflare.
Do them in order. T166 needs a PR preview URL, so open the stacked PRs first (after
you've read the review notes in the session summary).

## T166 — Worker CPU time on a preview URL

Goal: each page stays at or under 10 ms CPU (Workers Free limit; research.md R1).

1. Get a preview URL: open a PR for the branch, wait for the Workers Builds check, copy
   its preview URL.
2. Load realistic data. Sign in to the preview as an admin, go to `/admin/demo` and run
   **Load demo data**. (Note: the loader makes about 45 subrequests against the Free
   limit of 50, so if it fails with "Something went wrong", that is the likely cause.
   Say so in the T167 issue list. Don't retry in a loop.)
3. Start a tail in a terminal: `npx wrangler tail away --format json`. Each request logs an event; read `cpuTime`
   (ms). Dashboard alternative: Cloudflare dashboard → Workers & Pages → the worker →
   Metrics → CPU time (p50 and p99).
4. Visit each page 5 times, signed in as a manager (richest data): `/` (dashboard),
   `/requests/new` (also type dates to trigger the preview RPC), `/calendar`,
   `/approvals`. Ignore the first hit after a deploy (cold start).
5. Record the median and worst of each page in `specs/001-mvp/research.md` under R1
   (add a **Measured** bullet: date, preview URL commit, one line per page).
6. Any page above 10 ms: open an issue "Move <page> work into Postgres" labelled
   `performance`, and link it from R1.

## T167 — Full quickstart on a clean clone

1. `git clone` the repo into a new folder (not your working copy) and check out the
   branch under test. Docker Desktop must be running.
2. Follow `specs/001-mvp/quickstart.md` top to bottom: local setup, then every row of
   the **Automated gates** table, then the **Manual walkthrough** steps 1–7.
3. Keep a scratch list as you go. For each gap (a command that fails, a step that is
   unclear, a result that differs from "Expected"), open one GitHub issue: title says
   what broke, body has the exact step, what you saw, what the doc said.
4. Known things to watch for:
   - `npm run seed:local` must run before `npm run demo:load`.
   - Admin pages are under `/admin/users`, `/admin/holidays`, `/admin/demo`.
   - A stale `next start` on port 3100 makes `npm run test:e2e` reuse an old build.
     Kill it first.
5. Tick T167 in `specs/001-mvp/tasks.md` when the walkthrough passes and every gap has
   an issue.

## T168 — Deployed smoke check (production)

From the "Deployed smoke check" section of quickstart.md:

1. `/sign-in` on the production URL loads and shows the sign-in form (no 500, no
   console errors).
2. `health()` through the keep-alive: open the latest run of the **Keep-alive**
   workflow in GitHub Actions (T019, PR #202) and confirm it passed and logged `true`.
   Use "Run workflow" to trigger a fresh one if it's old.
3. Brevo invite: as an admin on production, invite an address you control. The email
   must arrive (check spam), the link must open the set-password page, and setting a
   password must sign you in. Deactivate that test user afterwards.
4. Do not load demo data on production unless you want it there.
5. Tick T168 in `tasks.md`. Anything that fails: open an issue and leave the box
   unticked.

## When done

Tell the agent the results (numbers for T166, issue links for gaps). It will update
`research.md`, tick the tasks and run the journal.

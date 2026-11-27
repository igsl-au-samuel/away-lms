# Manual steps: T166–T168 (for Sam)

These three need your accounts and your hands. The agent must not touch Cloudflare.
Do them in order. T166 needs a PR preview URL, so open the stacked PRs first (after
you've read the review notes in the session summary).

## T166 — Worker CPU time on a preview URL

Goal: each page stays at or under 10 ms CPU (Workers Free limit; research.md R1).

1. Get a preview URL: open a PR for the branch, wait for the Workers Builds check, copy
   its preview URL.
2. Load realistic data. Sign in to the preview as an admin, go to `/admin/demo` and run
   **Load demo data**. (Note: measured 2026-11-26 in `tests/unit/demo-load.test.ts`, which
   goes red if the roster grows — **36** subrequests on a first load, **42** when a reset deletes
   the previous roster (one per demo user), plus **2** for the admin guard in front of either:
   **44 at worst** against the Free limit of 50. Since #448 the roster is also held to a calendar
   that never makes the loader retry (`tests/unit/demo-roster-calendar.test.ts`), so 44 is the
   measured worst case, not a hope. The retry loop itself still allows three retries per request —
   up to **80** on a reset, **74** on a first load — and neither fits. How a failure reads: if it stopped after the previous demo was deleted,
   the page says the demo is incomplete and that loading again rebuilds it; before that point it
   says "Something went wrong". Say which one you saw in the T167 issue list, and don't retry a
   failure in a loop.)
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

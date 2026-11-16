# Away: how we built a leave system with an AI-native SDLC

Status as of 2026-10-20 (Phase 6). Source material: [`JOURNAL.md`](JOURNAL.md) (one entry per session),
the [decision records](../decisions/) and [`ROADMAP.md`](../ROADMAP.md). Companions:
[`METRICS.md`](METRICS.md) (full numbers and gaps), [`CONCEPTS.md`](CONCEPTS.md) (the ideas in plain
language) and the [presentation](../presentation/index.html). The live demo chapter is added after the demo.

## What we set out to do
Two things at once: build a real leave management tool for our team, and use the build to show a
different way of running a software project, where AI agents do much of the work and people decide what
matters and approve what ships. The budget was $0, so everything runs on free tiers.

**The flow we wanted:** spec → issues → agent builds → automated checks → human approves the merge → deploy.

## What exists now
**The app (Away).** Staff sign in by admin invite only. They see balances per leave type, request leave
with a live preview of the working days it uses, and see a team calendar with QLD, NSW and Hong Kong
public holidays. Managers and admins approve or decline requests. Approved leave lands on a shared
Google Calendar. Admins manage leave types, allowances, holidays and invites. Demo employees can pad
the small real team (ADR 0004).

**Claude can use it too.** Away has an MCP server, so a person can ask Claude to check a balance, preview
leave or approve a request. There is a local version for Claude Code and a remote one for Claude chat,
signed in with OAuth. Claude can only do what the signed-in person can do, because the database makes
that decision, not the tool. Anything that changes data needs a preview first.

**Stack (all free tier):** Next.js on Cloudflare Workers · Supabase (Postgres, Auth, row-level security) ·
Brevo for emails · GitHub Actions · Google Calendar API.

## How it was built
1. **Spec first.** Interview, constitution (7 principles), then a product spec with 6 user stories.
   Scope decisions were Sam's; the agent drafted the questions and wrote everything up.
2. **Plan and tasks.** Architecture, data model and 15 decision records, then 168 issue-sized tasks. Every
   permission rule in the access matrix has its own test task, written before the code it tests.
3. **Issues as the unit of work.** 177 issues generated from the task list by a script, with a template
   (goal, acceptance criteria, files, out of scope).
4. **Agents build, checks verify.** Tests first, then code. CI runs lint, typecheck, unit, integration,
   database (pgTAP) and browser (Playwright) tests, plus an AI code review on every PR.
5. **Humans approve and deploy.** Merges and every hosted-setting change were done by Sam. The agent
   wrote the steps; it did not touch production secrets.

A tiny end-to-end dry run (issue #205: add a footer line) proved the pipeline on day one: `@claude`
comment, branch in 17 seconds, PR, all checks green, preview URL, merge, live in about 10 minutes.

## The numbers
| | |
|---|---|
| Calendar time | 2026-10-16 to 2026-10-20 (5 days) |
| Logged sessions | 58 journal entries, 57 of them in Claude Code; about 28 hours hands-on |
| Tokens (Claude Code, whole project) | about 170.3M, of which 1.41M output; about 97% is cached context re-read |
| Cost at API list prices | **$63.06** (Sonnet 5.5 $32.57, Opus 5.5 $30.49). Not what was paid: the real cost was the existing Pro subscription. |
| Commits · PRs merged | 183 · 58 (issues and PRs numbered #1 to #262) |
| Tests | 285 unit · 67 integration · 452 database policy · 23 browser |
| Decision records | 15 |

The Claude Code figures cover the whole project (it started on 16 October). Claude chat sessions and
the GitHub Action runs (80 AI reviews, a few `@claude` builds) are not in them and can't be measured;
they are a known gap. Details, the daily split and how to refresh: [`METRICS.md`](METRICS.md).

## Where the human stayed in charge
- What to build and who can see what (roles, privacy of leave types, over-balance requests).
- Every service choice that could cost money or carry a licence risk (Cloudflare over Vercel, Brevo).
- All dashboard and secret changes on the hosted services.
- Merging, and the explicit approval before anything that migrates production.
- Accepting a known limitation (the MCP CPU overrun) rather than paying to remove it.

## What went wrong, and what we learnt
- **Tests first found things the spec missed.** Writing the permission tests found that `TRUNCATE`
  ignores row-level security and that Supabase grants it by default, so a signed-in user could wipe a
  table. Fixed by ADR 0009. Passing tests that run as a superuser would never have shown it.
- **"Free" has to mean "allowed".** Vercel's free tier is non-commercial only, which would have been a
  risk for a work tool, so the stack moved to Cloudflare.
- **Task checkboxes lied.** One task (deploying the database workflow) was never built, and production
  had no schema until we looked. Check reality, not the list.
- **Stacked PRs merge into their parent, not `main`.** A deploy silently didn't run because of it.
  The fix was to retarget before merging, or avoid stacking.
- **Local success didn't prove hosted success.** Calendar sync worked locally; hosted had five gaps
  (function not deployed, migration not pushed, wrong site URL, a burned invite link, a secret entered
  as a plain variable).
- **Measure the first call, not the average.** The remote MCP server ran over the free plan's 10 ms CPU
  limit. Our first explanation was wrong, and the second only showed up once we timed cold starts.
  Cost: a measured, documented overrun that we accepted instead of buying a paid plan.
- **Secrets in chat.** An access token was pasted into a chat once. It was revoked and regenerated, and the
  working rule became: secrets never go in chat or in the repo (the repo is public).
- **Small habits mattered.** Check `git status` before trusting a handoff, number decision records
  before writing them, and don't force-remove a worktree that has a linked `node_modules`.

## Where the AI went wrong, in plain terms
These came up during the sessions, often explained in passing. Here each one is spelled out: what
happened, how it was caught, and what it would have meant if it hadn't been.

| What happened | How it was caught | What it would have meant |
|---|---|---|
| The task list said the database deploy step was built. It never was, so production had an empty database. | While setting up Sam's first sign-in on production (session 32). | The live app had no tables at all. The fix took one PR, but nothing had warned us. |
| It blamed the wrong thing for the MCP server running over the CPU limit. Its test ran the same request over and over, which hid the slow first request. | Sam measured production and the numbers didn't fit the theory (session 57). | We might have rebuilt the server as a separate service to fix a problem that wasn't there. |
| Its own clean-up commands destroyed work: a forced folder removal threw away an uncommitted edit, another deleted the installed packages, and a file move overwrote a test. | Redoing the edit; a broken install; the unit test count dropping from 111 to 108. | Lost work, small each time. The pattern: a "force" option skips the safety check. |
| It stacked pull requests on top of each other, so one merged into another branch instead of `main` and the deploy never ran. | The deploy workflow had not run after the merge, and production was missing a database change (sessions 40 and 41). | A change can look "merged" without being live. |
| It wrote bugs into its own code: a sign-in redirect that could send people to another site, a connection that stayed dead after sign-out, retry gaps in calendar sync. | The separate AI code review, before merge (sessions 30, 34, 38, 39). | This is why review is a separate step: the reviewing AI caught the building AI. |
| It logged whole error objects, which could put database text into the logs. | Its own test for the logs (session 50). | Logs can leak data; test what gets written, not only what gets shown. |
| Bookkeeping slips: two decision records both numbered 0014, two sessions with the same number, one journal entry left on an unmerged branch, a build file committed by accident. | Later sessions noticing; one entry recovered on 20 Oct (#262). | Small, but the paper trail is what this presentation is built from. |

**The common thread:** the AI was confident each time. It was caught by something outside itself: a
test, a second review, or Sam checking production. That is the case for the checks and gates.

## What we'd do next
- **Close the loop on the demo issues.** Five small `status:ready` issues are queued (#176, #228 to
  #231) for the live autonomous build.
- **Make `@claude` fully hands-off.** Today it pushes a branch and posts a "Create PR" link; a human
  or the driving agent opens the PR. One prompt change would let it open the PR itself.
- **Backlog features from the spec:** half days, notifications, cancelling approved leave, CSV
  export, and a `cancel_request` tool for Claude once cancelling exists.
- **Before real colleagues use it:** demo logins off, human approval on, and a week of error checks.

## What is still open
- Read the temporary `[mcp-timing]` logs in Observability and remove them.
- Turn the demo logins off or change the demo password before real colleagues use the app.
- Turn human approval back on for `main`, and rehearse the remote MCP demo and one autonomous run.
- One week after team use starts, check the error card for CPU-limit failures.

## Live demo (to add after the demo)
What was shown, what was delayed or broke, and how it was handled.

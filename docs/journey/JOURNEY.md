# Away: how we built a leave system with an AI-native SDLC

Status as of 2026-10-20. Source material: [`JOURNAL.md`](JOURNAL.md) (one entry per session), the
[decision records](../decisions/) and [`ROADMAP.md`](../ROADMAP.md). This is a first draft; the live demo
chapter is added after the demo.

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
| Logged sessions | 57 (54 in Claude Code; the rest in Claude chat) |
| Tokens (Claude Code, to 2026-10-19) | about 166.6M, of which 1.39M output (the rest is mostly cached context) |
| Cost at API list prices | about **$62.18** (Opus 5.5 $30.49, Sonnet 5.5 $31.69). Not what was paid on the plan. |
| Issues and PRs | numbered #1 to #260 |
| Tests | 285 unit · 67 integration · 452 database policy · 23 browser |
| Decision records | 15 |

Counted by matching `ccusage` session ids to this project's transcript folder, since `ccusage` alone
covers every project on the machine. It misses Claude chat sessions and GitHub Action runs. Run
`ccusage` again for current figures.

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

## What is still open
- Read the temporary `[mcp-timing]` logs in Observability and remove them.
- Turn the demo logins off or change the demo password before real colleagues use the app.
- Turn human approval back on for `main`, and rehearse the remote MCP demo.
- One week after team use starts, check the error card for CPU-limit failures.
- A presentation version of this document.

## Live demo (to add after the demo)
What was shown, what was delayed or broke, and how it was handled.

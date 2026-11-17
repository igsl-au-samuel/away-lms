# Away: Team Working Agreement

Status: DRAFT v0.2 (both of us to review and edit before this is final)

**This is the one doc to start from.** Wherever you are and whichever coding agent you
use, read this first. `CLAUDE.md` holds the short rules Claude Code loads automatically
and `AGENTS.md` is the same pointer for Qoder; both point back here, and if any of them
disagrees with this doc, this doc wins.

## Team

- Sam (`igsl-au-samuel`): [title]
- [Manager name] (`hornkiu3`): [title]

## Principle

There are two of us, and we share every role. Roles are hats we wear per issue, not job titles. Neither of us writes the code by hand, so the human check that matters is **a person reading what the agent built and trying it, before it reaches `main`.**

- **Guideline:** the other person reviews. That is the default for anything non-trivial.
- **Simple, low-risk work** (a typo, wording, a small docs or test fix) can be reviewed and merged by whoever opened it, as long as they have read the agent's summary and CI is green.
- **Protected areas (below) are never self-merged.** Both of us look at those.

(Proposed in v0.2; the manager to confirm or change. See Open questions.)

GitHub is the single source of truth. Your laptop holds a clone you work in, and
nothing counts until it is pushed, reviewed and merged on GitHub.

## Hats

| Hat | What it means |
|---|---|
| Product owner | Decides what gets built and in what order. Keeps the roadmap issues up to date. |
| Builder | Implements an issue on a branch (with their own agent — Qoder or Claude Code) and opens a pull request. |
| Reviewer | Reads the PR summary, tries the preview deploy, checks the result against the issue's acceptance criteria, and approves or requests changes. |
| Tester | Tries features as an employee, manager and admin. Logs bugs as issues. |
| Release | Merges an approved PR and confirms the deploy worked. |
| Docs | Keeps `/docs` in step with what was built (user guide, architecture, roadmap). |

## Decisions

- **Either of us can decide alone:** small implementation choices, wording, bug fixes, docs.
- **Both of us must agree:** roadmap order, changes to roles or permissions, the data model, anything involving real staff data, security or compliance items, hosting or migration choices, and anything with a cost.
- **If we disagree:** [agree a tiebreaker, e.g. the manager decides on scope, Sam on technical approach].
- A decision worth remembering becomes an ADR in `docs/decisions/` (in the same PR as the change).

---

## 1. One-time setup: the repo (Sam, as repo admin)

Checked against GitHub on 2026-11-17 as the repo owner, and the live settings are
written up in Phase 2 of `docs/ROADMAP.md`. #352 stays open for the last item below
(a decision, not a setting) and for the two things branch protection cannot express
for a two-person team: a required human review, and `CODEOWNERS` on the protected
areas. Both remain convention.

- [x] **Branch protection on `main`** (Settings → Branches → `main`):
  - Require a pull request before merging, so nothing goes straight to `main`.
  - Require **0 approving reviews**. The other-person review is a guideline (see Principle); a hard requirement would block self-merging simple work, because GitHub doesn't let an author approve their own PR. If we later want it enforced for protected areas, add a `CODEOWNERS` file for those paths.
  - Dismiss stale approvals when new commits are pushed.
  - Keep the required status checks: `lint`, `typecheck`, `unit`, `build`, `e2e`, `db`.
  - **Do not allow bypassing** the rules (this applies them to admins too).
  - "Require branches to be up to date before merging" is left **off** on purpose: a
    green PR stays green when someone else merges behind it, so re-check CI before you
    merge rather than assuming the run you saw is the run that lands.
- [x] **Merge button** (Settings → General → Pull Requests): allow **squash merging** only, so each PR becomes one commit on `main`. Keep "Automatically delete head branches" on.
- [x] Add `CLAUDE.local.md` to `.gitignore` (the repo is public; personal notes must never be committed). `AGENTS.local.md`, the Qoder equivalent, is ignored too.
- [x] Add an `idea` label for brainstorms (see section 5).
- [ ] Decide who else needs dashboard access (Cloudflare, Supabase, Brevo). Local development needs none of them. Production secrets stay with whoever owns that account; never share them in chat, issues or the repo.

## 2. One-time setup: your machine (each person)

You need Node 24, Docker Desktop, Git (on Windows, use Git Bash), the GitHub CLI
(`gh`) and a coding agent — Qoder, or Claude Code — each signed in with **your own**
accounts.

```bash
gh auth login                                   # your GitHub account
git clone https://github.com/igsl-au-samuel/away-lms.git
cd away-lms
npm ci
npx supabase start                              # local Postgres, Auth, Studio, Mailpit (Docker)
npx supabase db reset                           # migrations + reference seed
cp .env.example .env.local                      # fill from `npx supabase status`
npm run seed:local -- --password <pw>           # local admin, manager and employee users
npm run dev                                     # http://localhost:3000
```

Check it works: sign in as each role locally, then run `npm run lint`,
`npm run typecheck` and `npm test`. Everything local uses fake data.

Optional: create `AGENTS.local.md` (Qoder) or `CLAUDE.local.md` (Claude Code) in the
repo root for your own agent preferences (model choice, journaling, how you like
handoffs). Both are gitignored and only your agent reads its own.

### Why it's called a "pull request"

You *push* your branch up to GitHub. Then you open a pull request, which asks the
project: "please **pull** my changes **into** `main`." It is named from the point of
view of the one being asked: `main` pulls your work in. Pushing alone doesn't ask
for anything; it just uploads your branch.

## 3. Day to day: working on an issue

1. **Pick an issue** and assign yourself, so we don't both build the same thing. No issue yet? Create one first, with acceptance criteria. If we both need the same core file, say so before starting.
2. **Start from the latest `main`:**
   ```bash
   git switch main
   git pull
   git switch -c feat/<issue-number>-short-name     # or fix/… docs/… chore/…
   ```
   If someone merged migrations since you last pulled, run `npx supabase db reset`.
3. **Build** with your agent. Commit often with conventional messages (`feat: …`, `fix: …`). Push early, even if it isn't finished, so the work is safe and visible:
   ```bash
   git push -u origin HEAD
   ```
4. **Open a PR** when it's ready for review (open it as a draft earlier if you want CI and a preview URL). Put `Closes #<issue>` in the description. Keep PRs small: one issue, one PR.
5. **CI must pass.** Cloudflare Workers Builds posts a preview URL on the PR. The Claude review bot also comments; its review is advisory only.
6. **Get it reviewed.** By default, ask the other person (add them as reviewer): they try the preview URL, check the acceptance criteria, and approve or request changes. For simple, low-risk work you can review it yourself: read the agent's summary, check the preview. Fix by pushing more commits to the same branch.
7. **Merge** (see below), then confirm the deploy and update your local copy:
   ```bash
   git switch main
   git pull
   git branch -d feat/<issue-number>-short-name
   ```

**Keeping a branch up to date** when `main` has moved on:
```bash
git fetch
git merge origin/main        # fix any conflicts, run the tests, then push
```
Don't rebase or force-push a branch the other person has checked out.

**Working on the other person's branch** (to fix their PR, say): `git fetch`, then
`git switch <their-branch>`, and push normal commits. Tell them in the PR first.

**Using `@claude` on GitHub:** mentioning `@claude` in an issue or PR comment runs
Claude in GitHub Actions, which builds on a branch and gives you a link to open the
PR. You are the PR's author, so by default the other person reviews it. These runs use Sam's
Claude subscription.

## 4. When to merge

Merge a PR only when **all** of these are true:

- CI is green.
- It has been reviewed: by the other person (the default), or by you for simple, low-risk work. A review means a human has read the agent's summary and tried the preview. Protected areas always need the other person. Re-review if commits were added after approval.
- Changes in a protected area (below) were looked at by both of us.
- The review conversations are resolved.

Use **Squash and merge**, with a conventional commit title. Either of us can press
the button once it's approved (usually the author, so they can watch the deploy).
On merge, Cloudflare redeploys the app and the **Deploy DB** workflow applies new
migrations to the hosted database. Check that the app still loads. If a deploy breaks
production, revert the PR on GitHub (the "Revert" button opens a new PR) rather than
pushing fixes straight to `main`.

## Protected areas (both of us must look at changes here)

- Authentication and roles/permissions
- Leave balance calculations
- Audit log
- Database schema and migrations
- Secrets, config, CI and deployment

Only one person should have an open migration at a time; say so in the issue before
writing one, so the migration order doesn't clash.

Four tables are audited by database triggers: `profiles`, `leave_requests`,
`allowance_overrides` and `leave_types`. A migration that rewrites any of them fires
those triggers, so the log fills with entries that read as though a person made the
change. A migration PR therefore says how it avoids them — the accepted patterns, and
what each table's triggers actually write, are in "Notes for migrations" in
`specs/002-transaction-audit/quickstart.md`, and the PR template carries it as a
checklist line.

Two readings of the list were settled on 2026-11-17, because the list is short and the
difference decides what can move without Sam at the laptop:

- **Audit log** means its schema, its triggers and what gets written to it. A module or
  component that only *reads* audit rows for display is not protected.
- **`specs/**.md`** is documentation. A status note *about* the audit log is not the
  audit log.

## Rules for the agent (applies to every Qoder and Claude Code session in this repo)

- The agent never pushes to `main`, for anyone, under any circumstances.
- The agent never merges into a protected area. Those still need one of us at the button,
  which is the only enforcement the protected list has: branch protection asks for zero
  approving reviews, so nothing on GitHub stops a merge.
- **Speed-up exception** (agreed 2026-11-17, for non-protected work only). The
  orchestration session may merge a PR outside the protected areas, under all of these:
  re-measured at the moment of merging, not from a digest — `state: OPEN`,
  `mergeable: MERGEABLE`, all six required checks `SUCCESS` on the exact head SHA being
  merged, and `main` unchanged since those checks ran (or the branch rebased onto it,
  because "require branches to be up to date" is off); the evidence posted on the PR
  before the button is pressed; one merge at a time, waiting for `main`'s own CI and
  Deploy DB to go green before the next; and only while that session is actually
  running, so no scheduled job ever reaches `main`.
- An agent's review — including the GitHub review bot's — is advisory. It never counts as
  the human review, and it does not count for a protected area either.
- The agent doesn't change protected areas without the issue saying so.
- Test and dev data is fake. Never put real staff or leave data in the repo, prompts or logs.
- Never commit secrets or `.env` files.
- Each of us uses our own GitHub and agent logins.
- At the end of each task, the agent states: the next task, the suggested model and effort, and whether to continue in the same session or start fresh with a handoff. The shared `next-step` skill does this in Claude Code; **it has not been ported to Qoder yet**, so on Qoder the same three lines are expected by convention, in the same order.

## 5. Where we talk, hand off and keep notes

GitHub already works as our shared journal, and both of our agents can read it
with `gh`. We don't keep a separate shared notes folder: a file only reaches the
other person after a merge, and two people appending to one file causes merge conflicts.

| What | Where |
|---|---|
| Work to do, bugs | An issue |
| Handoff ("done / next / blocked") | A comment on the issue or PR |
| Discussing a change | PR review comments |
| Brainstorms and ideas | An issue labelled `idea`; promote it to a real issue when we commit to it |
| Decisions | An ADR in `docs/decisions/` |
| Personal notes, journals, session handoffs | Your own `AGENTS.local.md` / `CLAUDE.local.md`, or files outside the repo |

**The repo is public**, so everything in issues and comments is public too.
Anything internal (real names, staff data, HR matters, costs) goes in [private
channel] instead.

To hand off to the other person's agent, ask yours to "write a handoff comment on
issue #N". Whoever picks it up tells their agent "start from the latest comment on
issue #N".

`docs/handoff/` and `docs/journey/` are Sam's existing session notes and journey log
for the SDLC demo. Don't add to them unless you're keeping that log.

## Open questions

- [ ] Is "the other person reviews" a guideline (as proposed here), or should it be a hard rule? If hard, set branch protection to 1 required review and drop self-merging.
- [ ] Who is the tiebreaker, and for what?
- [ ] How often do we check in, and where do we talk (chat, call)? Where do internal or private notes live?
- [ ] Which docs does the manager want to review versus just be informed about?
- [ ] Who owns the future self-hosting migration decisions?
- [ ] Does the manager need access to the Cloudflare, Supabase or Brevo dashboards?

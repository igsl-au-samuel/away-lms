# Concept map — the ideas behind Away, in plain language

A reference for the presentation audience. Each idea is explained in a sentence or two, then tied to
the moment in this build where it mattered. Grouped by the four layers of the AI-native SDLC we set
out to show (journal session 01).

```
 1. Spec hub          2. Execution             3. Orchestration + verification     4. Context
 what to build   →    agents do the work   →   checks and gates decide what ships   what the AI can see and use
 spec, ADRs, tasks    Claude Code, skills      PRs, CI, tests, AI review, human     MCP servers (dev tools,
                      models, tokens           merge, preview, deploy               and Away's own)
```

## 1. Spec hub — deciding what to build

**Spec-driven development.** Write down what the software must do before anyone (human or AI)
writes code, then make every later step point back to it. An AI agent is only as good as the
instructions it reads; a spec makes those instructions durable.
*In Away:* GitHub Spec Kit ran the flow: interview → constitution → spec (6 user stories, 32
requirements) → plan → 168 tasks → issues. ([ADR 0001](../decisions/0001-spec-kit-for-spec-driven-flow.md))

**Constitution.** A short list of rules the project never breaks, which every later plan is checked
against. *In Away:* 7 principles; "permissions live in the database" was non-negotiable.

**Decision record (ADR).** A one-page note of a decision: the context, what we chose, and what it
costs us. It answers "why is it like this?" months later, for people and for agents.
*In Away:* 15 of them, from the stack choice to accepting the CPU overrun.

**Task → issue.** Each task becomes a GitHub issue with a fixed template: goal, acceptance criteria,
files to touch, out of scope. A good issue is a prompt an agent can finish without asking questions.
*In Away:* a script created 177 issues from the task list in about 10 minutes.

## 2. Execution — agents doing the work

**Agent.** An AI that doesn't just answer but acts: reads files, runs commands, edits code, opens
pull requests, and checks its own results. *In Away:* Claude Code did almost all the building,
on Sam's PC and inside GitHub Actions.

**CLAUDE.md and skills.** CLAUDE.md is the project's standing instructions, read at the start of
every session (rules, where things are, definition of done). Skills are reusable instruction packs
for a recurring job. *In Away:* `session-journal` logged every session; `next-step` picked the next
task, the model and whether to start a fresh session.

**Model and effort.** Bigger models think better and cost more. Matching the model to the job is a
cost lever. *In Away:* Opus for planning, auth and schema design; Sonnet for building from a clear
issue. Sonnet wrote about two thirds of the output.

**Tokens, context and cache.** A token is roughly ¾ of a word. The context is everything the model
can see in one session. Each turn re-reads that context; the cache makes re-reading cheap.
*In Away:* about 97% of the 170M tokens were cache reads. Keeping sessions short, with a written
handoff between them, was the main way to keep usage down.

**Handoff.** A short note (`docs/handoff/NEXT.md`) that lets a fresh session pick up where the last
one stopped, instead of dragging a long, expensive context along.

## 3. Orchestration and verification — what decides what ships

**Branch and pull request (PR).** Work happens on a copy (a branch). A PR proposes merging it into
the real version (`main`) and is where checks and reviews happen. *In Away:* 58 PRs merged.

**CI (continuous integration).** Robots that run on every PR: lint (style), typecheck, unit,
integration, database and browser tests, and a build. A red check blocks the merge.

**Test first.** Write the test that describes the rule, watch it fail, then write the code that makes
it pass. It proves the test can catch a mistake. *In Away:* this is how the `TRUNCATE` hole was found:
a signed-in user could have wiped a table, and the spec had missed it. ([ADR 0009](../decisions/0009-grants-below-rls.md))

**AI code review.** A second AI pass reads each PR and comments. A fresh reviewer doesn't grade its
own work. *In Away:* it ran on every PR; deeper `/code-review` passes found 9 to 10 real issues
in the big changes, most fixed before merge.

**Human gate (branch protection).** GitHub rules that say what must be true before a merge: checks
green, and optionally a human approval. *In Away:* checks were required throughout; human approval
was switched off for speed and goes back on before the demo. Production database changes and secrets
always needed Sam.

**Preview and deploy.** Every PR gets its own temporary copy of the app (a preview URL) to click
through. Merging to `main` deploys to production automatically. *In Away:* Cloudflare Workers Builds.

## 4. Context — what the AI can see and use

**MCP (Model Context Protocol).** A standard plug that lets an AI use a tool or data source. It meant
two things here: tools Claude used *while building* (GitHub, a read-only database view), and Away
exposing *its own* MCP server so Claude can check balances, request and approve leave.

**Row-level security (RLS).** The database itself decides who can see or change each row, whatever
asks: the web app, Claude, or a script. *In Away:* because of this, Claude can never do more than the
signed-in person can. The MCP server needed no permission code of its own.

**OAuth and consent.** The standard "Sign in with…" handshake. The person signs in to Away and
approves Claude's access; Claude gets a limited, expiring token, never a password.

**Two-step writes (preview token).** Anything that changes data needs a preview first. The preview
returns a short-lived signed token bound to that person and those exact details, and the write is
refused without it. *In Away:* Claude has to show you the request before it can submit it.

**Free tier limits.** Free plans come with rules: usage caps, CPU time per request, sleep when idle,
and sometimes "non-commercial only". *In Away:* Vercel was dropped for that reason; the database is
pinged every 3 days so it doesn't pause; the remote MCP server runs over the 10 ms CPU limit and that
was accepted.

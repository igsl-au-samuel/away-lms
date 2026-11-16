# Metrics — what Away took to build

Collected 2026-10-20 for Phase 6. Sources: `ccusage` (Claude Code's local logs, run by Sam on his
machine), the git history, the GitHub API and [`JOURNAL.md`](JOURNAL.md).

## Headline
| | |
|---|---|
| Calendar time | 16 to 20 October 2026 (5 days; first commit 16 Oct 22:48) |
| Logged sessions | 58 journal entries (57 in Claude Code, 1 in Claude chat, plus a parallel chat during session 03), then unjournaled work on 20 Oct (#260 to #262) and this wrap-up |
| Hands-on time | about 28 hours, summed from the journal's per-session estimates (one long hosted-setup session had no estimate) |
| Commits on `main` | 183 |
| Pull requests merged | 58 |
| Issues and PRs created | numbered #1 to #262 (177 issues were generated from the task list in one go) |
| Decision records (ADRs) | 15 |
| Automated tests | 285 unit · 67 integration · 452 database policy (pgTAP) · 23 browser (Playwright) |
| Money spent | **$0** beyond the existing Claude Pro subscription |

## Claude Code usage (ccusage, this project only)
ccusage reports every project on a machine, so Sam scoped it by copying only this project's
transcript folder into a temporary config directory. The project started on 16 October, so
16 to 20 October is its whole lifetime: these Claude Code figures are complete, not a partial window.

| Model | Cost at API list prices | Output tokens | Cache read | Cache write |
|---|---:|---:|---:|---:|
| Sonnet 5.5 | $32.57 | 928,651 | 110.1M | 3.16M |
| Opus 5.5 | $30.49 | 482,260 | 54.4M | 1.27M |
| **Total** | **$63.06** | **1,410,911** | **164.4M** | **4.44M** |

- Total tokens including cache: about **170.3M**. Fresh input: only 3,754 tokens.
- About 97% of all tokens are **cache reads**: the same project context (CLAUDE.md, specs, open
  files) re-read on every turn at a fraction of the normal price. Output, the code and docs Claude
  actually wrote, is under 1% of the volume.
- **$63.06 is not what was paid.** It is what the same usage would cost on the pay-per-token API.
  On the Pro plan the real cost was the subscription Sam already had.
- Sonnet did most of the building (about two thirds of output). Opus was kept for planning, auth,
  schema and review work, per the `next-step` skill's model table, and still cost almost as much.

**By day**

| Day | Cost | What happened |
|---|---:|---|
| Thu 16 Oct | $9.21 | Feasibility, repo, spec, plan, 168 tasks |
| Fri 17 Oct | $36.77 | Pipeline, the whole MVP (US1 to US6), MCP server, calendar sync |
| Sat 18 Oct | $1.34 | Hosted calendar sync, deploy fixes, demo issues |
| Sun 19 Oct | $12.70 | Remote MCP server: spec, plan, OAuth, build, tests |
| Mon 20 Oct | $3.04 | CPU investigation, docs, journey draft (still growing) |

## What these numbers don't include (known gaps)
- **Claude chat sessions.** ccusage can't see them and chat shows no token counts, so they can't be
  measured. Known ones: the feasibility review (session 01), the parallel visual-direction chat
  (session 03), Sam's drafts of `DEMO.md` and `MCP-TOOLS.md`, and the Phase 6 wrap-up. They are a
  handful of sessions against 57 in Claude Code, so they are likely a small share, but that is an
  estimate, not a measurement.
- **GitHub Action runs.** The AI review ran 80 times (54 completed; 25 were cancelled because a
  newer push replaced them) and `@claude` built on issues a few times. Both run on the subscription
  token, so they cost nothing extra, but their tokens are not in ccusage.
- **Sam's time outside sessions** (dashboards, accounts, reading) isn't logged.

## How to refresh
Run `npx ccusage@latest` with only this project's transcript folder in its config directory (as above).
Don't use the machine-wide `ccusage daily` total: it includes other projects.

---
name: session-journal
description: Append a short entry to docs/journey/JOURNAL.md at the end of every task or session (before next-step), and write an ADR when a real decision was made. Feeds the journey documentation and final presentation. Also use when the user says "log this" or "journal".
---

# Session journal

This journal is the raw material for the final documentation and presentation.
Keep entries factual and short: 10–20 lines.

## Append, don't read
Append with a shell heredoc (`cat >> docs/journey/JOURNAL.md <<'EOF'`).
**Do not read the whole journal first.** It grows every session. To get the next
session number, run `grep -c '^## Session' docs/journey/JOURNAL.md`.

## Entry template
```
## Session NN — <title> · YYYY-MM-DD
- **Where:** Claude Code | Claude chat | GitHub Action · **Model/effort:** <model> / <effort>
- **Goal:** <one line>
- **Did:** <2–5 bullets of outcomes, not steps>
- **Decisions:** <bullets; link ADR if written> (or "none")
- **Lessons:** <what surprised us, what we'd do differently. This becomes the "lessons learnt" section>
- **AI vs human:** <what the agent did autonomously vs what needed Sam>
- **Effort:** ~<minutes> wall-clock · context at end ~<n>% · PRs/issues: #..
```
Skip token counts. They're collected afterwards with `npx ccusage@latest`, which
reads Claude Code's local logs. Note chat-only sessions explicitly, because ccusage
can't see them.

## ADRs
If the session made a decision someone might later ask "why?" about (a stack
choice, a schema shape, an auth model, dropping a feature), write
`docs/decisions/NNNN-kebab-title.md`:
`# NNNN Title` · **Status** (accepted/superseded) · **Context** (2–3 lines) ·
**Decision** · **Consequences** (incl. trade-offs). Keep it under 25 lines.

## Raw transcripts (optional, local only)
If Sam wants the raw chat kept, run `/export` and save it into
`docs/journey/raw/`. That folder is gitignored, because transcripts can contain
secrets and the repo is public.

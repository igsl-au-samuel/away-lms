---
name: next-step
description: Run at the end of every finished task (after session-journal) to recommend the next task, the model and effort for it, and whether to continue in this session or start fresh with a handoff. Also use when the user asks "what's next?".
---

# Next step

Close out the task with one short, decisive recommendation. Don't re-explain
the finished work.

## 1. Find the next task (cheap reads only)
1. Tick the finished item in `docs/ROADMAP.md` (edit just that line).
2. The next task is the first unticked item in the current phase. If the phase is
   done, it's the first item of the next phase.
3. In Build/Demo phases, if the roadmap points at the backlog, run
   `gh issue list --label status:ready --limit 5` and pick the top issue.
4. Phase rhythm: **Spec → Plan → Build → Verify → Document → Release**.
   After a build, the next step is usually verify (tests/review). After verify,
   it's document. Don't skip document; it's short and keeps the journey record complete.

## 2. Pick model + effort
Use the lightest option that will do it well. On Pro, Opus uses up limits faster,
so pick it only for judgment-heavy work.

| Task type | Model | Effort |
|---|---|---|
| Brainstorm, product spec, architecture, schema/auth design | opus | high (plan mode) |
| Breaking a spec into issues/tasks | sonnet | high |
| Feature build from a clear issue/spec | sonnet | medium |
| Large or ambiguous build, cross-cutting refactor | opus plans → sonnet builds | high → medium |
| Debugging, cause unknown | sonnet | high |
| Bug fix, cause known | sonnet | low |
| Writing/adjusting tests | sonnet | medium |
| Code review of a PR | sonnet | high |
| Docs, journal, ADRs, README | sonnet | medium |
| Visual design, presentation, UI polish | opus | medium |
| Mechanical: config, renames, git/gh ops, installs | haiku (or sonnet) | low |

## 3. Same session or fresh?
**SAME** when all of these hold:
- the next task uses context already loaded (e.g. documenting what we just built,
  fixing what review just found)
- it uses the same model (switching models re-reads the context uncached)
- the context is under ~50% and hasn't been compacted

**FRESH** when any of these hold:
- it's a different phase or area of the codebase
- the model changes
- the context is over ~60%, or has been compacted
- it's a code review (a fresh reviewer is unbiased; it shouldn't grade its own work)
- the task is self-contained in an issue/spec anyway

If FRESH: overwrite `docs/handoff/NEXT.md` with ≤30 lines:
goal · done-criteria · files to open (exact paths) · decisions to respect ·
what NOT to touch · then the suggested model/effort.

## 4. Output exactly this block

```
✅ Done: <finished task, ≤10 words>
➡️ Next: <next task> · phase: <phase>
🧠 Model: <model> · Effort: <low|medium|high> — <why, ≤12 words>
🔁 Session: <SAME|FRESH> — <why, ≤12 words>
▶️ Start with: "<one-line prompt to paste>"
```

For FRESH, the start prompt is: `Read docs/handoff/NEXT.md and do it.`
Then stop and wait for the user's go-ahead. Don't start the next task unprompted.

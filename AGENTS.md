# Away — agent instructions (Qoder)

Claude Code loads `CLAUDE.md`. This is the same pointer, for Qoder. It adds no
rules of its own, so the two cannot drift.

**Start with `docs/TEAM.md`.** It is the working agreement, and it wins whenever it
disagrees with this file or `CLAUDE.md`.

Precedence: `docs/TEAM.md` → `CLAUDE.md` / this file. Qoder also reads
`.qoder/rules`, which outranks this file if it exists; this repo does not have one.

Where things are:

- Working agreement, branching, review, merging, protected areas: `docs/TEAM.md`
- Stack, commands, rules for agents, definition of done: `CLAUDE.md`
- Phase and task checklist: `docs/ROADMAP.md` · Decisions: `docs/decisions/`
- Visual direction and tokens: `docs/design/DIRECTION.md`

Personal, per-machine settings are gitignored and not shared. Read
`AGENTS.local.md` if it exists.

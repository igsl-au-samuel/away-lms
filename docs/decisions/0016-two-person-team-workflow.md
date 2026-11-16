# 0016 Two-person team workflow

**Status:** accepted (pending manager review of docs/TEAM.md)

**Context:** Until now Sam built alone and merged Claude-built PRs with no
review required by branch protection. A second builder (Sam's manager) now has
write access, so the "human-approved merge" step needs to be real.

**Decision:**
- `docs/TEAM.md` is the single onboarding and working agreement; `CLAUDE.md` is
  kept short and points to it. Personal workflow lives in gitignored `CLAUDE.local.md`.
- A human reviews Claude's work before it merges. Guideline: the other person
  reviews; simple low-risk PRs may be self-reviewed; protected areas always get
  both. Branch protection requires a PR and green CI but 0 approvals.
  Claude never merges a PR or pushes to `main`. Squash merge only.
- Handoffs and brainstorms live in GitHub issues/PR comments, not shared files.

**Consequences:** Review depends on discipline, not enforcement (a hard
requirement would block self-merging simple work). Solo work isn't blocked when one of us is away. Shared notes avoid merge conflicts but are public
(repo is public), so internal discussion needs a private channel. Enforcement
depends on branch-protection settings Sam applies by hand.

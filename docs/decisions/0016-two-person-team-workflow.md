# 0016 Two-person team workflow

**Status:** accepted (pending manager review of docs/TEAM.md)

**Context:** Until now Sam built alone, merging Claude-built PRs himself with no
review required by branch protection. A second builder (Sam's manager) now has
write access, so the "human-approved merge" step needs to be real.

**Decision:**
- `docs/TEAM.md` is the single onboarding and working agreement; `CLAUDE.md` is
  kept short and points to it. Personal workflow lives in gitignored `CLAUDE.local.md`.
- Every PR needs one approving review from the person who did not author it;
  Claude never merges a PR or pushes to `main`. Squash merge only.
- Handoffs and brainstorms live in GitHub issues/PR comments, not shared files.

**Consequences:** Nothing reaches `main` without the other person, which slows
solo work when one of us is away. Shared notes avoid merge conflicts but are public
(repo is public), so internal discussion needs a private channel. Enforcement
depends on branch-protection settings Sam applies by hand.

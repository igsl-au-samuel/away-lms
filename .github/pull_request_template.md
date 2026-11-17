Closes #

## What and why
<!-- One or two lines. Link the spec/task (e.g. specs/001-mvp/tasks.md T0xx). -->

## Checklist
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Build passes
- [ ] Access-matrix rows covered by pgTAP tests (`specs/001-mvp/contracts/access-matrix.md`), or N/A (no policy/RPC change)
- [ ] No migration, or this PR says how a migration that rewrites `profiles`, `leave_requests`, `allowance_overrides` or `leave_types` avoids writing false `audit_log` entries (`specs/002-transaction-audit/quickstart.md` → "Notes for migrations")
- [ ] Follows `docs/design/DIRECTION.md` (UI changes only), or N/A
- [ ] No new service or dependency with a cost

## No secrets
- [ ] This repo is public: no secrets, API keys, `.env*` files or raw chat transcripts in this PR (Constitution II)
- [ ] The PR references its issue and stays within that issue's scope (Constitution IV)

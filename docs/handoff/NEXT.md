# Handoff → Session 32: merge the stack, then manual Phase 9

**Model:** sonnet · **Effort:** low–medium

## State
Stack of open PRs: #208, #209 → main; #210 → #211 → #212 → #218 (US5) → #219 (US6, Phase 9, review fixes). Review fixes are in `237ad6d`; deferred findings are #213–#217. Nothing merged yet.

## Goal
1. Check CI on #218 and #219 (`gh pr checks`). Fix anything red.
2. Merge bottom-up with Sam's OK (each PR's base moves to main after its parent merges).
3. After merge: Sam does T166–T168 using `docs/handoff/MANUAL-T166-T168.md`. Record the T166 numbers in `specs/001-mvp/research.md` R1 and tick the tasks.
4. Triage #213–#217 after T166 gives CPU numbers (#215 and #216 depend on them).

## Sam must do by hand
Set the hosted Supabase minimum password length to 10 (Auth > Providers > Email). Only the local `config.toml` is in the repo.

## Don't
Touch Cloudflare or T017. Merge without Sam's OK.

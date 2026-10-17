# Handoff → Session 31: fix review findings, then push

**Model:** sonnet · **Effort:** medium

## State
T162–T165 committed (`9cdc541`) on `feat/t140-admin-demo`. Branch not pushed; stacked on #210 → #211 → #212 (profile + admin branches have no PR yet). Session 30 ran a code review of `main...HEAD`. Nothing from it is fixed yet. Manual steps for Sam are in `docs/handoff/MANUAL-T166-T168.md`.

## Goal
Ask Sam which findings to fix. Recommended fix-now (confirmed by spot-check):
1. `src/lib/safe-next.ts`: open redirect via tab/newline (`next=/%09/evil.com`). Parse with `new URL(next, origin)` and require same origin. Add a unit test.
2. `supabase/migrations/…_count_working_days.sql`: unbounded `generate_series`. Reject `invalid_range`/`spans_years` before counting. Add a pgTAP case.
3. `supabase/config.toml:183`: `minimum_password_length = 6` → 10 (app requires 10).
4. `…_submit_leave_request.sql:51`: `over_balance_days` should use `days - greatest(available, 0)`, also in the validate/preview migration (line ~91).
5. `src/app/(app)/admin/**`: re-check the admin role in each admin page, not only the layout.

Defer (open as issues): `admin_set_allowance` logging no-ops and unknown user id; `loadDemo` swallowed errors and 50-subrequest risk; `setUserActive` DB/auth divergence; `getViewer` extra round trips (use `getClaims`); sign-out as GET.

Then, with Sam's OK: push the branches and open PRs for `feat/t135-profile` (base `feat/t126-team-calendar`) and `feat/t140-admin-demo` (base `feat/t135-profile`). PR bodies reference issues (`Closes #…`).

## Files to open
The files named above only. Migrations are append-only, so fixes to already-applied migrations go in a new migration if they were merged to main; otherwise check with Sam.

## Don't
Touch Cloudflare or T017. Push without Sam's OK. Do T166–T168 (manual).

# Handoff → Session 24: US2 request UI (T107–T110)

**Model:** sonnet · **Effort:** medium

## State
Branch `feat/t092-request-leave`, stacked on `feat/t054-clients-tokens` (PR #209, still open). T092–T106 are done: tests, migrations `…001800`–`…002100`, types, `leaveRequestSchema`, error codes, and `src/actions/requests.ts` (`previewLeaveRequest`, `submitLeaveRequest`). pgTAP 296, unit 57, integration 8 and e2e 6 pass. `tests/e2e/requests.spec.ts` is **red on purpose** until the UI exists. Not pushed and no PR yet: CI e2e would fail until this session's work lands.

## Goal
Build T107–T110 in `specs/001-mvp/tasks.md` so that `requests.spec.ts` passes, then push and open a PR (base `feat/t054-clients-tokens`, or `main` if #209 has merged; rebase first).

## Done when
`npm run test:e2e` passes all 7, plus lint, typecheck, unit and integration. Tick T107–T110.

## UI contract (`requests.spec.ts` relies on it, so don't change it)
- `/requests/new` form fields labelled exactly **Leave type** (a `<select>` with options by name), **Start date**, **End date** (`type="date"`) and **Note**. Button **Submit request**.
- Debounced live preview inside `role="status"`, e.g. "4 working days", plus the available balance. When `over_balance_days` is set, show the text "over balance by N days" (singular "day" for 1).
- Each blocking error from `preview.errors[]` goes in a `role="alert"` with `ERROR_COPY` text. **Submit is disabled** while there are errors or no valid preview.
- A successful submit redirects to `/requests`: a table with one `row` per request (type, dates, working days, `StatusBadge` "Pending", decider and comment), newest first.
- The dashboard Annual row then shows the reduced available balance (already works through `get_balances`).

## Files to open
`tests/e2e/requests.spec.ts` · `src/actions/requests.ts` · `src/components/badges.tsx` (`StatusBadge`) · `src/components/balances.tsx` (table pattern) · `src/app/(app)/page.tsx` · `src/lib/dates.ts` · `docs/design/DIRECTION.md`

## Decisions to respect
- Add a "Request leave" link in `src/components/nav.tsx`. The form must be usable at phone width.
- Active leave types are read directly from `leave_types` (RLS select). Requests come from `leave_requests` (own rows by RLS); the decider name comes from `profiles`.
- E2E alert locators filter by text. Use the Write tool for many files.

## Don't
Touch migrations, Cloudflare or T017. Don't change the RPC signatures or the error copy without updating the tests.

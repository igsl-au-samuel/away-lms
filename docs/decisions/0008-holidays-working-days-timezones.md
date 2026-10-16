# 0008 Holidays, working-day counting and timezones

**Status:** accepted · 2026-10-16

## Context
Working days exclude weekends and the requester's regional public holidays (FR-012),
and the count is fixed at submission. The team spans QLD (Brisbane), NSW (Sydney)
and HK. Automatic holiday import is backlog, and the admin maintains the lists after
the seed (spec Assumptions). Dates and "today" show in the viewer's timezone
(FR-026), and timezone doesn't change which days count.

## Decision
- **Holiday data:** a committed, hand-checked seed for the current and next year
  (2026, 2027), built from official sources: Queensland Government (including the
  **Royal Queensland Show day (Ekka)**, a Brisbane-area holiday), NSW Government
  (statutory public holidays, not the bank holiday), and the HK Government's
  **general holidays** list (gov.hk, 1823). Each seed row cites its source year in a
  comment. No runtime holiday API or npm holiday package, because import is backlog.
- **Counting runs in Postgres:** `private.count_working_days(region, start, end)`
  is the only implementation. `submit_leave_request` stores its result and
  `preview_leave_request` shows the same number before submission. The holiday
  region is copied onto the request (`region_code`). Later edits to holidays or the
  user's region don't change stored counts.
- **Dates are plain `date` values** ("YYYY-MM-DD"), never converted to JS `Date`
  objects, so they can't move across a timezone boundary. Times (decided at, changed
  at) are `timestamptz`, shown in the viewer's timezone with `Intl.DateTimeFormat`.
- **"Today" and the current leave year** come from the viewer's IANA timezone
  (`profiles.timezone`, checked against `pg_timezone_names`). Each region has a
  default timezone: Australia/Brisbane, Australia/Sydney, Asia/Hong_Kong.
- **Leave year** = the calendar year of the dates. A request whose start and end fall
  in different years is refused by a check constraint, with a friendly message from
  the RPC.

## Consequences
- One counting implementation, tested in pgTAP against the hand-calculated cases in
  SC-004.
- The holiday seed must be checked once a year. The backlog "Holiday import" issue
  would replace that job.
- No timezone library is needed. `Intl` is built into Workers and browsers, which
  helps the 10 ms CPU budget (ADR 0005).

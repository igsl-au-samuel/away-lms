# Quickstart: validating the audit log

Run after the migrations for [plan.md](plan.md) exist. Nothing here is built yet; this
page says how to prove it works. Details live in
[data-model.md](data-model.md) and [contracts/](contracts/).

## Prerequisites

- Docker running, local Supabase started (`npm run db:start`).
- Dependencies installed (`npm ci`). No new dependency and no new service (Constitution I).
- Local seed users (`scripts/seed-local.ts`) for one employee, one manager, one admin.

## 1. Database tests

```bash
npm run db:reset           # applies migrations, runs the backfill once
npm run db:test            # pgTAP: access-matrix rows 28–42, event-by-route, behaviour
npm run db:lint            # no table without RLS, no mutable search_path
```

Expected: all green. The existing 001 tests pass unchanged (SC-009).

## 2. Event check by hand

In Studio or `psql`, as the seeded admin session, then as direct SQL:

1. Submit a request as the employee, approve it as the manager with a comment.
2. Set then remove an allowance for the employee, with a reason.
3. Change a user's role and region in one save.
4. Change a leave type's default allowance and its name in one save.
5. `select created_at, actor_name, action, subject_name, before, after, comment
   from audit_log order by created_at desc, id desc limit 20;`

Expected: one entry per event (two for step 3, two for step 4), actor roles correct, the
direct SQL changes show actor `System`, and the allowance reason appears as the comment.

## 3. Append-only check

As each of anon, employee, manager, admin and with the secret key, try
`update`, `delete`, `insert` and `truncate` on `audit_log`.

Expected: every attempt fails (`42501` or `audit_immutable`), and the row count is the same.

## 4. Backfill check

On a database with pre-existing requests and allowance changes (a copy of the pre-migration
state): run the migration, then `select count(*) from audit_log where is_backfilled;`,
then run `select private.audit_backfill();` again as the database owner (the API cannot
call it) and count again.

Expected: one `submitted` entry per request, one decision entry per decided request, one
entry per old allowance change, original times and people, and the same count after the
second run (SC-006).

Before migration B: confirm `select count(*) from allowance_changes` equals the count of
`audit_log` rows with `source_key like 'ac:%'`.

## 5. App check

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration   # demo load, reset and remove leave audit entries alone
npm run test:e2e           # My history, Audit page filters, CSV export, access refusal
npm run build
```

Manually, with `npm run dev`:

- Employee: `/history` shows only their entries; `/admin/audit` is refused.
- Manager: `/history` also shows entries for requests they can decide; the Approvals page
  allowance panel still works.
- Admin: `/admin/audit` filters by person, action, entity, role, demo/real and dates;
  Export CSV downloads the same rows; a comment starting `=1+1` opens as text in a
  spreadsheet.
- Delete a demo user (remove demo): their entries still appear with their name.

## 6. Performance check

Seed 50,000 entries (a script in `scripts/`, fictional data only), then time
`audit_my_history`, a filtered `audit_search` page and a 10,000-row `audit_export_csv`.

Expected: pages under 2 s, export under 30 s (SC-008).

## Notes for migrations

Any later migration that rewrites `profiles`, `leave_requests`, `allowance_overrides` or
`leave_types` fires the audit triggers and would write false entries. Check each such
migration, and say in the PR how it avoids them.

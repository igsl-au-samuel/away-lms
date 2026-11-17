# Quickstart: validating the audit log

Run after the migrations for [plan.md](plan.md) exist. **Slice 1 is built** in
[#354](https://github.com/igsl-au-samuel/away-lms/pull/354) (draft, unmerged), so steps 1–3 apply
now; step 4 needs slice 2, step 5's `/history` and `/admin/audit` screens need slices 3–4, and step
6 needs slice 4. Where a sentence below describes something slice 1 does not deliver yet, it says
so. Details live in [data-model.md](data-model.md) and [contracts/](contracts/).

## Prerequisites

- Docker running, local Supabase started (`npm run db:start`).
- Dependencies installed (`npm ci`). No new dependency and no new service (Constitution I).
- Local seed users (`scripts/seed-local.ts`) for one employee, one manager, one admin.

## 1. Database tests

```bash
npm run db:reset           # applies migrations (the backfill joins this line in slice 2, A038)
npm run db:test            # pgTAP: rows 28–40 today, 41–42 with slices 3–4; events; behaviour
npm run db:lint            # no table without RLS, no mutable search_path
```

Expected: all green. The existing 001 tests pass unchanged (SC-009).

On a machine that runs the whole stack locally, `npm run test:e2e` needs two more things than this
page used to say: the values from `.env.local` in the process (some specs import the integration
helpers, which throw without them), and `npm run seed:local -- --password "$E2E_PASSWORD"` after any
`db:reset` — the reset clears `profiles` and the auth users, so without a reseed every signed-in
spec fails with "Invalid email or password". Serially (`--workers=1`) the 23 specs take about 25
seconds; in parallel on one local stack they time out.

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

Slice 1 delivers all of that **except the allowance comment**: `admin_set_allowance` will not set
`away.audit_reason` until A039 (slice 2), so in slice 1 the entry's `comment` is null and the reason
lives only in `allowance_changes.reason`. `audit_events_allowances.sql` proves the mechanism works by
setting that GUC directly, including R2's rule that an empty reason after a non-empty one in the same
transaction does not inherit it. Saving the same allowance number again writes nothing.

## 3. Append-only check

As each of anon, employee, manager, admin and with the secret key, try
`update`, `delete`, `insert` and `truncate` on `audit_log`.

Expected: every attempt fails with `42501 permission denied`, the secret key included — Postgres
checks grants before it fires a trigger. `audit_immutable` answers only a session that owns the table.
The row count is the same either way.

Measured on slice 1 over the API (PostgREST, real JWTs, the seeded accounts): 15 attempts — update,
delete and insert as each of the five roles, plus PostgREST's `on_conflict` upsert — all refused with
`42501 permission denied for table audit_log`, count 70 before and after. So every API route is
refused by the **grants**, and `audit_immutable` only ever answers a session that owns the table:
`psql`, Studio, or a migration. `truncate` cannot be sent over HTTP, which is why the SQL tests carry
that case. See A004–A006 in [tasks.md](tasks.md) and the `service_role` row of rows 36–39 in
[contracts/access-matrix.md](contracts/access-matrix.md), which the slice 1 review in #354 settled:
the secret key is refused by the grants, and the trigger stays as the owner-session guard.

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
`leave_types` fires the audit triggers and would write false entries: rows that read as
though a person made the change, with actor `System` because a migration has no login.
Check each such migration, and say in the PR how it avoids them. Two answers are accepted
(`docs/TEAM.md` states the rule; `.github/pull_request_template.md` asks for it):

- **A deliberate carry-over.** Either write the `audit_log` rows directly as the table
  owner — the backfill migration does this (A038): `insert … on conflict (source_key) do
  nothing`, `is_backfilled = true`, original `created_at`, so a rerun adds nothing. Only
  an owner session can: `authenticated` holds `select` and nothing else, `anon` and
  `service_role` hold nothing at all, and no trigger blocks an insert. Or suppress the
  triggers for the session with
  `set session_replication_role = replica` while rewriting the source rows, which is what
  the pgTAP fixtures (A034) and the 50k seed (A068) do. Either way the migration's whole
  job has to be moving history — it is not a switch to reach for when entries are
  inconvenient.
- **No entries are expected.** Each change trigger guards on columns, so name the columns
  the rewrite touches and show that none of them is audited. What writes today:
  `leave_requests` — every insert, and an update that moves `status` off `pending`;
  `allowance_overrides` — every insert and delete, and an update that changes `days`;
  `profiles` — every insert, and an update that changes `role`, `region_code` or
  `is_active`; `leave_types` — an update that changes `default_allowance`, `is_capped`,
  `name`, `is_active` or `sort_order` (no insert trigger). A rewrite that inserts or
  deletes rows in the first three tables always writes, so say so rather than reaching for
  the first answer.

`alter table … disable trigger`, and dropping or recreating a trigger, are not ways to
satisfy this note: they change what the log promises for the rows written around them.
The exception is a migration that alters `audit_log` itself and so has to drop
`audit_no_update_delete` or `audit_no_truncate` to do it — the immutability trigger's own
detail message allows exactly that. Such a PR says so and is reviewed as a protected-area
change.

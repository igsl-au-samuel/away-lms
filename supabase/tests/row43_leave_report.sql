-- #180, access matrix row 43: the utilisation report and its CSV.
--
-- Two things this file is careful about, and both are why it is longer than "call the function, count
-- the rows". It asserts on the *fixture person* rather than on the whole result set, because the stack
-- carries reference profiles from a migration and other lanes' leftovers, so a global count measures the
-- environment instead of the query. And it pairs the file with the page by row count, which is the one
-- claim the issue asks for and the one nobody can check by eye after the file is emailed.
--
-- The suite runs against a database that `npm run db:reset` built from `supabase/migrations`, like
-- every other file here, so nothing is applied by hand — but that means a stack that has not been reset
-- since this migration merged answers "function does not exist" rather than "the logic is wrong". The
-- `has_function` pair below is what tells those two apart.
begin;

select plan(24);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance, is_active, sort_order)
values ('Row43 annual', true, 20, true, 900) returning id as capped_id \gset
insert into public.leave_types (name, is_capped, default_allowance, is_active, sort_order)
values ('Row43 open', false, null, true, 901) returning id as open_id \gset
insert into public.leave_types (name, is_capped, default_allowance, is_active, sort_order)
values ('Row43 retired', true, 5, false, 902) returning id as retired_id \gset

-- Three approved days and two pending against a 20-day allowance; one approved day on a type with no
-- cap; four days in the previous year; two days on a type that has since been retired. The note is a
-- marker string, because the only way to test a silence is to put something distinctive in the thing
-- that is supposed to be left out (acceptance criterion four).
select tests.create_request(:'emp', '2026-04-06', '2026-04-08', 'approved', :'mgr', 3, :'capped_id') as r_appr \gset
select tests.create_request(:'emp', '2026-05-04', '2026-05-05', 'pending', null, 2, :'capped_id') as r_pend \gset
select tests.create_request(:'emp', '2026-06-01', '2026-06-01', 'approved', :'mgr', 1, :'open_id') as r_open \gset
select tests.create_request(:'emp', '2025-03-03', '2025-03-04', 'approved', :'mgr', 4, :'capped_id') as r_2025 \gset
select tests.create_request(:'emp', '2026-09-01', '2026-09-01', 'approved', :'mgr', 2, :'retired_id') as r_ret \gset
update public.leave_requests set note = 'ZZMARKER-note-must-not-appearZZ'
  where user_id = :'emp' and start_date = '2026-04-06';

-- ---- the two entry points exist with the signature the contract names ----
select has_function('public', 'leave_report', array['smallint'], 'leave_report(year) exists');
select has_function('public', 'leave_report_csv', array['smallint'], 'leave_report_csv(year) exists');

-- ---- allowed and refused: this is matrix row 43 ----
select tests.as_authenticated(:'mgr');
select lives_ok('select * from public.leave_report(2026::smallint)',
  'a manager reads the report');
select lives_ok('select * from public.leave_report_csv(2026::smallint)',
  'a manager exports it');

select tests.as_authenticated(:'adm');
select lives_ok('select * from public.leave_report(2026::smallint)',
  'an admin reads the report');

select tests.as_authenticated(:'emp');
select throws_ok(
  'select * from public.leave_report(2026::smallint)',
  'P0001', 'not_allowed', 'an employee is refused, not shown an empty report');
select throws_ok(
  'select * from public.leave_report_csv(2026::smallint)',
  'P0001', 'not_allowed', 'and the export is refused the same way');

select tests.as_authenticated(:'off');
select throws_ok(
  'select * from public.leave_report(2026::smallint)',
  'P0001', 'not_allowed', 'an inactive user cannot read it either');

select tests.as_anon();
select throws_ok(
  'select * from public.leave_report(2026::smallint)',
  '42501', null, 'anon: leave_report is not executable');

-- ---- the arithmetic, per column, so a failure names the column ----
select tests.as_authenticated(:'adm');
select is(
  (select allowance from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'capped_id'),
  20::numeric, 'the capped type reports its 20-day allowance for 2026');
select is(
  (select taken from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'capped_id'),
  3::numeric, 'taken is the approved days in that year, not the requested ones');
select is(
  (select pending from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'capped_id'),
  2::numeric, 'pending is counted separately, because it is not yet spent');
select is(
  (select available from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'capped_id'),
  15::numeric, 'and available is 20 minus both — the same number the balances panel shows');
select is(
  (select count(*)::int from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'capped_id' and available = 11),
  0, 'the 2025 request is not carried into the 2026 balance');
select is(
  (select allowance from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'open_id'),
  null::numeric, 'an uncapped type has no allowance to report, so the cell is empty and not zero');
select is(
  (select available from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'open_id'),
  null::numeric, 'and no available either, so the page can say No cap rather than a number');
select is(
  (select count(*)::int from public.leave_report(2026::smallint)
    where person_id = :'emp' and leave_type_id = :'retired_id'),
  1, 'a retired leave type still appears while it holds a counted request in the year');

-- ---- the file, against the screen ----
select is(
  (select split_part(csv, E'\n', 1) from public.leave_report_csv(2026::smallint)),
  'person,leave_type,allowance_days,taken_days,pending_days,available_days,demo',
  'the header names the seven columns in the documented order');
select is(
  (select array_length(string_to_array(csv, E'\n'), 1) - 1
     from public.leave_report_csv(2026::smallint)),
  (select count(*)::int from public.leave_report(2026::smallint)),
  'the CSV holds exactly as many data rows as the report read returns for the same year');
select is(
  (select row_count from public.leave_report_csv(2026::smallint)),
  (select count(*)::int from public.leave_report(2026::smallint)),
  'and the row_count it reports agrees with both');
select ok(
  (select csv like '%"Row43 annual"%' from public.leave_report_csv(2026::smallint)),
  'the fixture type is in the file');
select ok(
  (select position('ZZMARKER-note-must-not-appearZZ' in csv) = 0
     from public.leave_report_csv(2026::smallint)),
  'no request note reaches the CSV');
select ok(
  (select position('2026-04-06' in csv) = 0 from public.leave_report_csv(2026::smallint)),
  'nor does any request date, which is what makes the file a utilisation total rather than an absence log');

-- ---- the helper behind both reads stays unreachable from the API roles ----
select tests.reset_role();
select is(
  (select coalesce(string_agg(p.proname || ':' || r.grantee, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
     where n.nspname = 'private' and p.proname = 'report_rows'
       and has_function_privilege(r.grantee, p.oid::regprocedure, 'execute')),
  '',
  'no API role can call private.report_rows directly');

select * from finish();
rollback;

-- Spec 002 slice 4, A063: access matrix row 41 — who may call audit_search and audit_export_csv.
--
-- Row 41 is the first audit row where a refusal has two different shapes, and the difference is the
-- point. An employee or an inactive admin holds the grant, so they reach the function body and are
-- turned away by its own admin check with `not_allowed`; anon does not get that far, because
-- `revoke all … from public, anon` answers at the gate with 42501 before any code of ours runs. A
-- test that asserted only "the call failed" would pass if the grant lines were deleted (everything
-- would then raise 42501) or if the admin check were removed (employees would get a page of rows and
-- a 0-count assertion elsewhere would be the only thing that noticed). So each role here is pinned
-- to its own error, not to failure in general.
--
-- `not_allowed` is matched as SQLERRM, not just as P0001: a raise with any other message — a missing
-- column, a bad cast, an unrelated constraint — shares that code, and the message is what says the
-- admin check is what answered.
--
-- service_role is "n/a" in the matrix, because the secret key is not a route anyone takes to this
-- page. It is measured anyway, and the finding is worth writing down: Supabase's default privileges
-- in schema public hand execute on a new function to service_role, and the revoke list this project
-- uses everywhere (20261117140000_audit_my_history.sql:47) names `public` and `anon` only, so the
-- grant really is held. It is inert — the secret key carries no JWT, so auth.uid() is null,
-- private.is_admin() is false and the answer is `not_allowed`, one row short of reading the log —
-- but that is a property of the admin check, not of the grants, and it is asserted rather than
-- assumed.
begin;
select plan(16);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as admoff \gset

-- Two entries in a window nothing else on this stack reaches (see audit_search.sql for why the date
-- is 2031). Seeded directly: this row is about who may ask, not about who wrote.
set local session_replication_role = replica;
insert into public.audit_log
  (created_at, actor_id, actor_role, actor_name, action, entity, subject_id, subject_name,
   is_demo, source_key)
values
  (timestamptz '2031-04-01 09:00:00+00', :'adm', 'admin', 'Test admin', 'user_role_changed',
   'user', :'emp', 'Test employee', false, 'a63-1'),
  (timestamptz '2031-04-01 10:00:00+00', :'emp', 'employee', 'Test employee',
   'request_submitted', 'leave_request', :'emp', 'Test employee', false, 'a63-2');
set local session_replication_role = origin;

select is((select count(*)::int from public.audit_log where source_key in ('a63-1', 'a63-2')), 2,
  'the two entries both halves of this row measure against exist');

-- ---- employee: reaches the function, refused by its admin check ----
select tests.as_authenticated(:'emp');
select throws_ok('select count(*) from public.audit_search()', 'P0001', 'not_allowed',
  'an employee calling audit_search is refused by the function, not by the grant');
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''UTC'')',
  'P0001', 'not_allowed', 'an employee calling audit_export_csv is refused the same way');
-- The order of the two guards in the body is a contract too: FR-027 is about who may open the page
-- at all, and answering their question about the timezone first would tell them the rest of the
-- query was accepted.
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''Mars/Olympus'')',
  'P0001', 'not_allowed', 'the admin check runs before the timezone is looked at');
select tests.reset_role();

-- ---- manager: same ----
select tests.as_authenticated(:'mgr');
select throws_ok('select count(*) from public.audit_search()', 'P0001', 'not_allowed',
  'a manager cannot audit_search, though the policy lets them read part of the log');
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''UTC'')',
  'P0001', 'not_allowed', 'a manager cannot audit_export_csv either');
select tests.reset_role();

-- ---- inactive admin (X): a role they used to hold ----
select tests.as_authenticated(:'admoff');
select throws_ok('select count(*) from public.audit_search()', 'P0001', 'not_allowed',
  'an inactive admin is not an active one: audit_search refuses');
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''UTC'')',
  'P0001', 'not_allowed', 'and audit_export_csv refuses');
select tests.reset_role();

-- ---- anon: refused by the grant, before any of this code runs ----
select tests.as_anon();
select throws_ok('select count(*) from public.audit_search()', '42501', null,
  'anon has no execute on audit_search');
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''UTC'')', '42501', null,
  'anon has no execute on audit_export_csv');
select tests.reset_role();

-- ---- service_role: holds the grant, gets the same refusal as an employee ----
select tests.as_service();
select throws_ok('select count(*) from public.audit_search()', 'P0001', 'not_allowed',
  'the secret key reaches the body and is refused there: no JWT, so no admin, so no rows');
select throws_ok('select count(*) from public.audit_export_csv(p_tz => ''UTC'')',
  'P0001', 'not_allowed', 'and the same for the export');
select throws_ok('select private.audit_matches(null, null, null, null, null, null, null, null)',
  '42501', null, 'the shared filter is not reachable from the secret key');
select tests.reset_role();

-- ---- active admin: both work, and see the rows ----
select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_search(
             p_from => timestamptz '2031-04-01 00:00:00+00')), 2,
  'an active admin gets both entries back from audit_search');
select is((select row_count from public.audit_export_csv(
             p_tz => 'UTC', p_from => timestamptz '2031-04-01 00:00:00+00')), 2,
  'and the export builds a file for the same two');
select is((select truncated from public.audit_export_csv(
             p_tz => 'UTC', p_from => timestamptz '2031-04-01 00:00:00+00')), false,
  'which is not a truncated file');
select tests.reset_role();

select * from finish();
rollback;

-- Access matrix row 40: none of the audit plumbing is callable from outside a trigger
-- (FR-006). private.audit_write and private.audit_actor are exercised directly here, and
-- the grant sweep at the end covers every private.audit_* function, including the four
-- table trigger functions from A026-A029 and private.audit_backfill from slice 2, so this
-- file cannot rot into a partial check as the feature grows. It names one exception rather
-- than dropping the prefix: private.audit_matches, which the search and export functions
-- call as the invoking role. A new private.audit_* function is caught by this sweep unless
-- someone adds it to the exclusion below, which is the point.
begin;
select plan(17);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

select tests.as_authenticated(:'emp');
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'employee cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'employee cannot call private.audit_actor'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'manager cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'manager cannot call private.audit_actor'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'admin cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'admin cannot call private.audit_actor'
);

select tests.as_authenticated(:'off');
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'inactive user cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'inactive user cannot call private.audit_actor'
);

select tests.as_anon();
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'anon cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'anon cannot call private.audit_actor'
);

select tests.as_service();
select throws_ok(
  $t$ select private.audit_write('user_created', 'user') $t$,
  '42501', null, 'service_role cannot call private.audit_write'
);
select throws_ok(
  'select private.audit_actor()',
  '42501', null, 'service_role cannot call private.audit_actor'
);

-- The sweep behind the individual calls: no API role holds execute on any private.audit_*
-- function. Only the owner does, which is what lets a security definer trigger write.
-- audit_matches is excluded and asserted on its own three lines below, because it is the
-- one function in this prefix an API role must be able to reach.
select tests.reset_role();
select is(
  (select coalesce(string_agg(p.proname || ':' || r.grantee, ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
   where n.nspname = 'private'
     and p.proname like 'audit%'
     and p.proname <> 'audit_matches'
     and has_function_privilege(r.grantee, p.oid::regprocedure, 'execute')),
  '',
  'no API role can execute any private.audit_* function except audit_matches'
);

-- The exception, named: audit_search and audit_export_csv are security invoker, so the
-- predicate they apply to every row runs as the calling role, and that role needs execute
-- for the query to plan at all. It opens nothing around FR-022 — the rows already passed
-- the select policy before the predicate is applied, and the predicate cannot return a row
-- the policy hid. The grant is the read side of the same argument can_view_audit makes for
-- the select policy two assertions below.
select is(
  has_function_privilege(
    'authenticated',
    'private.audit_matches(public.audit_log, uuid, text, text, public.app_role, boolean, timestamptz, timestamptz)',
    'execute'),
  true,
  'authenticated can execute audit_matches, for the security invoker readers'
);
select is(
  has_function_privilege(
    'anon',
    'private.audit_matches(public.audit_log, uuid, text, text, public.app_role, boolean, timestamptz, timestamptz)',
    'execute'),
  false,
  'anon cannot execute audit_matches'
);
select is(
  has_function_privilege(
    'service_role',
    'private.audit_matches(public.audit_log, uuid, text, text, public.app_role, boolean, timestamptz, timestamptz)',
    'execute'),
  false,
  'service_role cannot execute audit_matches'
);

-- can_view_audit is the deliberate exception: the select policy is evaluated as the
-- calling role, so authenticated needs that one call and nothing else.
select is(
  has_function_privilege('authenticated', 'private.can_view_audit(uuid, uuid, text, text)', 'execute'),
  true,
  'authenticated can execute can_view_audit, for the policy'
);

select * from finish();
rollback;

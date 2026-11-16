-- Access matrix row 39: nobody truncates audit_log (FR-005, ADR 0009). TRUNCATE ignores RLS
-- entirely, so this is the case grants alone cannot cover — Supabase's default privileges
-- hand truncate to a role that was never meant to have it.
--
-- authenticated and anon lose truncate in 20261017001000_revoke_authenticated_truncate.sql
-- and audit_log revokes everything from service_role; an owner session is stopped by the
-- audit_no_truncate statement trigger.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

-- Scoped to a marker of our own: tests.create_user fires the profiles audit trigger, so
-- :'emp' already carries a user_created entry by the time this file starts counting.
select gen_random_uuid() as marker \gset

select private.audit_write('user_created', 'user', :'marker', :'emp');

select is(
  (select count(*)::int from public.audit_log where entity_id = :'marker'),
  1,
  'one entry seeded'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'employee cannot truncate (no grant)'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'manager cannot truncate (no grant)'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'admin cannot truncate (no grant)'
);

select tests.as_authenticated(:'off');
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'inactive user cannot truncate (no grant)'
);

select tests.as_anon();
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'anon cannot truncate (no grant)'
);

select tests.as_service();
select throws_ok(
  'truncate public.audit_log',
  '42501', null, 'service_role cannot truncate (no grant)'
);

-- A statement trigger fires even when the table is empty, so the owner is refused here
-- too. This is the only route that reaches the trigger, hence the only one it guards.
select tests.reset_role();
select throws_ok(
  'truncate public.audit_log',
  'P0001', 'audit_immutable', 'the owner session is refused by the statement trigger'
);

select is(
  (select count(*)::int from public.audit_log where entity_id = :'marker'),
  1,
  'the entry survives every refused truncate'
);

select * from finish();
rollback;

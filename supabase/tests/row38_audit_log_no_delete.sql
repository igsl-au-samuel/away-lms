-- Access matrix row 38: nobody deletes from audit_log (FR-005). Same two layers as row 37:
-- grants for the API roles and service_role, the immutability trigger for an owner session.
-- Tests never clean up with delete; the file's own rollback does it (Conventions).
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

-- Scoped to markers of our own: tests.create_user fires the profiles audit trigger, so
-- :'emp' already carries a user_created entry by the time this file starts counting.
select gen_random_uuid() as marker \gset

select private.audit_write('user_created', 'user', :'marker', :'emp');
select private.audit_write('user_role_changed', 'user', :'marker', :'emp');

select is(
  (select count(*)::int from public.audit_log where entity_id = :'marker'),
  2,
  'two entries seeded'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'employee cannot delete (no grant)'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'manager cannot delete (no grant)'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'admin cannot delete (no grant)'
);

select tests.as_authenticated(:'off');
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'inactive user cannot delete (no grant)'
);

select tests.as_anon();
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'anon cannot delete (no grant)'
);

select tests.as_service();
select throws_ok(
  $t$ delete from public.audit_log $t$,
  '42501', null, 'service_role cannot delete (no grant)'
);

select tests.reset_role();
select throws_ok(
  $t$ delete from public.audit_log $t$,
  'P0001', 'audit_immutable', 'the owner session is refused by the trigger'
);

select is(
  (select count(*)::int from public.audit_log where entity_id = :'marker'),
  2,
  'both entries survive every refused delete'
);

select * from finish();
rollback;

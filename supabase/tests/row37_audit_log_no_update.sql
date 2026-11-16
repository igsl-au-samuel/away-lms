-- Access matrix row 37: nobody updates audit_log (FR-005, "by any route"). The API roles
-- and service_role are refused by the grants; a direct SQL session as the owner gets past
-- the grants and is stopped by the audit_no_update_delete trigger instead. Both refusals
-- are asserted, because they are the two independent layers research R5 describes.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

-- Scoped to a marker of our own: tests.create_user fires the profiles audit trigger and
-- would otherwise land a user_created entry on :'emp' before this file starts counting.
select gen_random_uuid() as marker \gset

select private.audit_write('user_created', 'user', :'marker', :'emp', null,
  jsonb_build_object('role', 'employee'), null, 'keep me');

select is(
  (select count(*)::int from public.audit_log where entity_id = :'marker'),
  1,
  'one entry seeded'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'employee cannot update (no grant)'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'manager cannot update (no grant)'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'admin cannot update (no grant)'
);

select tests.as_authenticated(:'off');
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'inactive user cannot update (no grant)'
);

select tests.as_anon();
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'anon cannot update (no grant)'
);

select tests.as_service();
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  '42501', null, 'service_role cannot update (no grant)'
);

-- The owner bypasses grants, so only the trigger stands between it and the row. This is
-- the route the immutability trigger exists for: Studio, psql and migrations.
select tests.reset_role();
select throws_ok(
  $t$ update public.audit_log set comment = 'tampered' $t$,
  'P0001', 'audit_immutable', 'the owner session is refused by the trigger'
);

select is(
  (select comment from public.audit_log where entity_id = :'marker'),
  'keep me',
  'the entry still holds its original comment'
);

select * from finish();
rollback;

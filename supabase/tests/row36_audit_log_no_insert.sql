-- Access matrix row 36: nobody inserts into audit_log directly (FR-006). Every API role is
-- refused by the grants from migration A1, including service_role, so no caller reaches the
-- table at all. Writing happens only through private.audit_write, which only the audit
-- triggers can call (row 40).
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

-- One real entry to compare against. Written as the owner, the way a trigger does.
-- Every count below is scoped to this file's own subject: audit_log is shared and never
-- cleaned up, so a global count would depend on what ran before it.
select private.audit_write('user_created', 'user', null, :'emp');

select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp'),
  1,
  'one entry seeded'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'employee cannot insert'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'manager cannot insert'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'admin cannot insert'
);

select tests.as_authenticated(:'off');
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'inactive user cannot insert'
);

select tests.as_anon();
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'anon cannot insert'
);

select tests.as_service();
select throws_ok(
  $t$ insert into public.audit_log (actor_name, action, entity) values ('x', 'user_created', 'user') $t$,
  '42501', null, 'service_role cannot insert (no grant)'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp'),
  1,
  'refused attempts added no rows'
);

select * from finish();
rollback;

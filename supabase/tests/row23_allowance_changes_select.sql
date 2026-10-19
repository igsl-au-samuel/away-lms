-- Access matrix row 23: allowance_changes select. Own rows plus default-change
-- rows (user_id null) for an employee; everything for a manager or admin.
begin;
select plan(7);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as other \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row23 annual', true, 20) returning id as lt \gset

insert into public.allowance_changes (user_id, leave_type_id, year, old_days, new_days, changed_by, reason) values
  (:'emp', :'lt', 2026, 20, 25, :'adm', 'own'),
  (:'other', :'lt', 2026, 20, 22, :'adm', 'someone else'),
  (null, :'lt', null, 20, 21, :'adm', 'default change'),
  (:'off', :'lt', 2026, 20, 23, :'adm', 'inactive user');

select tests.as_authenticated(:'emp');
select is(
  (select array_agg(reason order by reason) from public.allowance_changes),
  array['default change', 'own'],
  'employee sees own rows and default-change rows only'
);

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.allowance_changes), 4, 'manager sees all rows');

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.allowance_changes), 4, 'admin sees all rows');

select tests.as_authenticated(:'off');
select is(
  (select count(*)::int from public.allowance_changes),
  0,
  'inactive user sees nothing, not even their own or default rows'
);

select tests.as_anon();
select throws_ok(
  'select * from public.allowance_changes',
  '42501', null, 'anon cannot select allowance_changes'
);

select tests.as_authenticated(:'other');
select is(
  (select count(*)::int from public.allowance_changes where reason = 'own'),
  0,
  'one employee cannot see another''s rows'
);

select tests.reset_role();
select is((select count(*)::int from public.allowance_changes), 4, 'rows are intact');

select * from finish();
rollback;

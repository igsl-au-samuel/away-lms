-- Access matrix row 21: allowance_overrides select.
begin;
select plan(6);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as other \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row21 annual', true, 20) returning id as lt \gset

insert into public.allowance_overrides (user_id, leave_type_id, year, days) values
  (:'emp', :'lt', 2026, 25),
  (:'other', :'lt', 2026, 18),
  (:'off', :'lt', 2026, 10);

select tests.as_authenticated(:'emp');
select is(
  (select array_agg(user_id) from public.allowance_overrides),
  array[:'emp'::uuid],
  'employee sees only their own overrides'
);

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.allowance_overrides), 3, 'manager sees all overrides');

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.allowance_overrides), 3, 'admin sees all overrides');

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.allowance_overrides), 0, 'inactive user sees no overrides');

select tests.as_anon();
select throws_ok(
  'select * from public.allowance_overrides',
  '42501', null, 'anon cannot select allowance_overrides'
);

select tests.reset_role();
select is((select count(*)::int from public.allowance_overrides), 3, 'rows are intact');

select * from finish();
rollback;

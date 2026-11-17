-- Access matrix row 21: allowance_overrides select.
begin;
select plan(7);

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

-- #382, the shape row20 had: a manager, an admin and the owner role each see every override on the
-- stack, so an unscoped count is a fact about the stack rather than about this file — green on a
-- freshly reset one, red as soon as an integration or e2e run has set anybody's allowance. Every
-- count below is keyed to `lt`, a leave type this file creates and rolls back, so no other run's row
-- can carry that id. The inactive-user zero stays unscoped on purpose: that role is denied every row,
-- so it holds whatever else the stack holds.
select count(*)::int as own_count
     , coalesce(md5(string_agg(o::text, '|' order by o.user_id, o.year)), '-') as own_md5
from public.allowance_overrides o where o.leave_type_id = :'lt' \gset

select tests.as_authenticated(:'emp');
select is(
  (select array_agg(user_id) from public.allowance_overrides),
  array[:'emp'::uuid],
  'employee sees only their own overrides'
);

select tests.as_authenticated(:'mgr');
select is(
  (select count(*)::int from public.allowance_overrides where leave_type_id = :'lt'),
  3,
  'manager sees all three overrides this file created'
);

select tests.as_authenticated(:'adm');
select is(
  (select count(*)::int from public.allowance_overrides where leave_type_id = :'lt'),
  3,
  'admin sees all three overrides this file created'
);

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.allowance_overrides), 0, 'inactive user sees no overrides');

select tests.as_anon();
select throws_ok(
  'select * from public.allowance_overrides',
  '42501', null, 'anon cannot select allowance_overrides'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_overrides where leave_type_id = :'lt'),
  :own_count,
  'reading them left the same number of rows'
);
select is(
  (select coalesce(md5(string_agg(o::text, '|' order by o.user_id, o.year)), '-')
     from public.allowance_overrides o where o.leave_type_id = :'lt'),
  :'own_md5',
  'and left every one of them byte-identical'
);

select * from finish();
rollback;

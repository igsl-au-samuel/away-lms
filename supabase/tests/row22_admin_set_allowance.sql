-- Access matrix row 22: admin_set_allowance. Admin only; capped types only;
-- each change appends one allowance_changes row (old, new, caller, reason).
begin;
select plan(14);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row22 annual', true, 20) returning id as capped \gset
insert into public.leave_types (name, is_capped, default_allowance)
values ('Row22 unpaid', false, null) returning id as uncapped \gset

select tests.as_authenticated(:'adm');

select is(
  (select days from public.admin_set_allowance(:'emp', :'capped', 2026::smallint, 25, 'Long service')),
  25.0::numeric,
  'admin sets an override'
);
select is(
  (select days from public.allowance_overrides where user_id = :'emp' and leave_type_id = :'capped' and year = 2026),
  25.0::numeric,
  'the override is stored'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes where user_id = :'emp' and leave_type_id = :'capped'),
  1,
  'setting an override writes one log row'
);
select is(
  (select old_days::text || '>' || new_days::text || ' ' || (changed_by = :'adm')::text || ' ' || reason
   from public.allowance_changes where user_id = :'emp' and leave_type_id = :'capped'),
  '20.0>25.0 true Long service',
  'log row has the old value (the default), new value, caller and reason'
);

select tests.as_authenticated(:'adm');
select lives_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, null, %L)', :'emp', :'capped', 'Reset'),
  'admin removes the override'
);
select is(
  (select count(*)::int from public.allowance_overrides where user_id = :'emp' and leave_type_id = :'capped'),
  0,
  'the override is gone'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes where user_id = :'emp' and leave_type_id = :'capped'),
  2,
  'removing an override writes one more log row'
);
select is(
  (select old_days::text || '>' || coalesce(new_days::text, 'null')
   from public.allowance_changes where user_id = :'emp' and leave_type_id = :'capped' order by id desc limit 1),
  '25.0>null',
  'removal log row: old 25, new null'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 5)', :'emp', :'uncapped'),
  'P0001', 'type_uncapped', 'an uncapped type raises type_uncapped'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'employee refused'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'manager refused'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'inactive admin refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes where user_id = :'emp'),
  2,
  'refused calls wrote no log rows'
);

select * from finish();
rollback;

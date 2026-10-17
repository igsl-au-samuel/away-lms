-- Access matrix row 7: leave_types insert/update is admin only, and nobody
-- deletes a type (it is retired with is_active = false instead).
begin;
select plan(12);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

-- Allowed: admin inserts and updates.
select tests.as_authenticated(:'adm');
select lives_ok(
  $$insert into public.leave_types (name, is_capped, default_allowance, sort_order) values ('Study', true, 5, 4)$$,
  'admin inserts a leave type'
);
update public.leave_types set default_allowance = 6, is_active = false where name = 'Study';
select tests.reset_role();
select is(
  (select default_allowance::text || ' ' || is_active::text from public.leave_types where name = 'Study'),
  '6.0 false',
  'admin updates a leave type'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  $$delete from public.leave_types where name = 'Study'$$,
  '42501', null, 'admin cannot delete a leave type'
);

-- Refused: employee, manager, inactive admin.
select tests.as_authenticated(:'emp');
select throws_ok(
  $$insert into public.leave_types (name, is_capped, default_allowance) values ('Emp leave', false, null)$$,
  '42501', null, 'employee cannot insert a leave type'
);
update public.leave_types set sort_order = 91 where name = 'Annual';
select throws_ok(
  $$delete from public.leave_types where name = 'Unpaid'$$,
  '42501', null, 'employee cannot delete a leave type'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  $$insert into public.leave_types (name, is_capped, default_allowance) values ('Mgr leave', false, null)$$,
  '42501', null, 'manager cannot insert a leave type'
);
update public.leave_types set sort_order = 92 where name = 'Personal/Sick';

select tests.as_authenticated(:'off');
select throws_ok(
  $$insert into public.leave_types (name, is_capped, default_allowance) values ('Off leave', false, null)$$,
  '42501', null, 'inactive admin cannot insert a leave type'
);
update public.leave_types set sort_order = 93 where name = 'Unpaid';

select tests.reset_role();
select is((select sort_order::int from public.leave_types where name = 'Annual'), 1, 'employee update has no effect');
select is((select sort_order::int from public.leave_types where name = 'Personal/Sick'), 2, 'manager update has no effect');
select is((select sort_order::int from public.leave_types where name = 'Unpaid'), 3, 'inactive admin update has no effect');

-- Refused: anon has no write grants.
select tests.as_anon();
select throws_ok(
  $$insert into public.leave_types (name, is_capped, default_allowance) values ('Anon leave', false, null)$$,
  '42501', null, 'anon cannot insert a leave type'
);
select throws_ok(
  $$update public.leave_types set sort_order = 94 where name = 'Annual'$$,
  '42501', null, 'anon cannot update a leave type'
);

select * from finish();
rollback;

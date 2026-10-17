-- Access matrix row 24: nobody writes allowance_changes directly, and nobody
-- writes allowance_overrides directly (only admin_set_allowance does).
begin;
select plan(12);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row24 annual', true, 20) returning id as lt \gset
insert into public.allowance_changes (user_id, leave_type_id, year, old_days, new_days, changed_by)
values (:'emp', :'lt', 2026, 20, 25, :'adm');
insert into public.allowance_overrides (user_id, leave_type_id, year, days) values (:'emp', :'lt', 2026, 25);

select tests.as_authenticated(:'adm');
select throws_ok(
  format('insert into public.allowance_changes (user_id, leave_type_id, changed_by) values (%L, %L, %L)', :'emp', :'lt', :'adm'),
  '42501', null, 'admin cannot insert allowance_changes'
);
select throws_ok(
  'update public.allowance_changes set new_days = 99',
  '42501', null, 'admin cannot update allowance_changes'
);
select throws_ok(
  'delete from public.allowance_changes',
  '42501', null, 'admin cannot delete allowance_changes'
);
select throws_ok(
  format('insert into public.allowance_overrides (user_id, leave_type_id, year, days) values (%L, %L, 2027, 5)', :'emp', :'lt'),
  '42501', null, 'admin cannot insert allowance_overrides directly'
);
select throws_ok(
  'update public.allowance_overrides set days = 99',
  '42501', null, 'admin cannot update allowance_overrides directly'
);
select throws_ok(
  'delete from public.allowance_overrides',
  '42501', null, 'admin cannot delete allowance_overrides directly'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('insert into public.allowance_changes (user_id, leave_type_id, changed_by) values (%L, %L, %L)', :'emp', :'lt', :'mgr'),
  '42501', null, 'manager cannot insert allowance_changes'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('insert into public.allowance_changes (user_id, leave_type_id, changed_by) values (%L, %L, %L)', :'emp', :'lt', :'emp'),
  '42501', null, 'employee cannot insert allowance_changes'
);
select throws_ok(
  format('insert into public.allowance_overrides (user_id, leave_type_id, year, days) values (%L, %L, 2027, 99)', :'emp', :'lt'),
  '42501', null, 'employee cannot insert their own override'
);

select tests.as_anon();
select throws_ok(
  format('insert into public.allowance_changes (user_id, leave_type_id, changed_by) values (%L, %L, %L)', :'emp', :'lt', :'adm'),
  '42501', null, 'anon cannot insert allowance_changes'
);
select throws_ok(
  format('insert into public.allowance_overrides (user_id, leave_type_id, year, days) values (%L, %L, 2027, 5)', :'emp', :'lt'),
  '42501', null, 'anon cannot insert allowance_overrides'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes) + (select count(*)::int from public.allowance_overrides),
  2,
  'nothing changed'
);

select * from finish();
rollback;

-- Access matrix row 20: get_balances for yourself or another user.
-- Yourself: any active user. Another user: manager or admin. Inactive and anon: refused.
begin;
select plan(7);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as other \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

select tests.as_authenticated(:'emp');
select lives_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'emp'),
  'employee can read their own balances'
);
select throws_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'other'),
  'P0001', 'not_allowed', 'employee cannot read another user''s balances'
);

select tests.as_authenticated(:'mgr');
select lives_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'emp'),
  'manager can read anyone''s balances'
);

select tests.as_authenticated(:'adm');
select lives_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'emp'),
  'admin can read anyone''s balances'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'off'),
  'P0001', 'not_allowed', 'inactive user cannot read even their own balances'
);

select tests.as_anon();
select throws_ok(
  format('select * from public.get_balances(%L, 2026::smallint)', :'emp'),
  '42501', null, 'anon: get_balances not executable'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.leave_requests),
  0,
  'reading balances changed nothing'
);

select * from finish();
rollback;

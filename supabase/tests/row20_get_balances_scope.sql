-- Access matrix row 20: get_balances for yourself or another user.
-- Yourself: any active user. Another user: manager or admin. Inactive and anon: refused.
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as other \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

-- Snapshot before any read, so the last assertion means "unchanged by reading" rather than
-- "this stack has never been used". #382: the same shape row05 uses.
select count(*)::int as requests_count,
       coalesce(md5(string_agg(r::text, '|' order by r.id)), '-') as requests_shape
from public.leave_requests r \gset

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
  :requests_count,
  'reading balances left the same number of requests'
);
select is(
  (select coalesce(md5(string_agg(r::text, '|' order by r.id)), '-')
     from public.leave_requests r),
  :'requests_shape',
  'reading balances changed nothing: no request gained, lost or edited a value'
);

select * from finish();
rollback;

-- Access matrix row 12: submit_leave_request. Any active user submits for
-- themselves only; the stored user_id is always the caller. Inactive and anon refused.
begin;
select plan(11);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row12 annual', true, 20) returning id as lt \gset

select has_function(
  'public', 'submit_leave_request', array['uuid', 'date', 'date', 'text'],
  'submit_leave_request(type, start, end, note) exists'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_leave_request'),
  1,
  'there is no overload that takes a user id'
);

select tests.as_authenticated(:'emp');
select is(
  (select user_id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08', 'Beach')),
  :'emp'::uuid,
  'employee submits for themselves'
);

select tests.as_authenticated(:'mgr');
select is(
  (select user_id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08')),
  :'mgr'::uuid,
  'manager submits for themselves'
);

select tests.as_authenticated(:'adm');
select is(
  (select user_id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08')),
  :'adm'::uuid,
  'admin submits for themselves'
);

select tests.reset_role();
select is(
  (select array_agg(user_id order by user_id) from public.leave_requests where leave_type_id = :'lt'),
  (select array_agg(u order by u) from unnest(array[:'emp', :'mgr', :'adm']::uuid[]) u),
  'each stored row belongs to its caller'
);
select is(
  (select status::text from public.leave_requests where user_id = :'emp' and leave_type_id = :'lt'),
  'pending',
  'a submitted request is pending'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-09-14', '2026-09-15'),
  'P0001', 'not_allowed', 'inactive user refused'
);

select tests.as_authenticated(gen_random_uuid());
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-09-14', '2026-09-15'),
  'P0001', 'not_allowed', 'a user with no profile is refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-09-14', '2026-09-15'),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.leave_requests where leave_type_id = :'lt'),
  3,
  'refused calls stored nothing'
);

select * from finish();
rollback;

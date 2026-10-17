-- Access matrix D2 (FR-024a, ADR 0004): a demo employee reading leave_requests
-- gets only their own rows, never a real colleague's or another demo user's.
begin;
select plan(4);

select tests.create_user('employee', 'QLD', true, true) as demo \gset
select tests.create_user('employee', 'QLD', true, true) as demo2 \gset
select tests.create_user('employee', 'NSW') as real \gset
select tests.create_user('manager', 'QLD') as mgr \gset

select tests.create_request(:'demo', '2026-09-07', '2026-09-08') as r_demo \gset
select tests.create_request(:'demo2', '2026-09-09', '2026-09-09') as r_demo2 \gset
select tests.create_request(:'real', '2026-09-10', '2026-09-10') as r_real \gset
select tests.create_request(:'real', '2026-10-05', '2026-10-05', 'approved', :'mgr') as r_real2 \gset

select tests.as_authenticated(:'demo');
select is(
  (select array_agg(id) from public.leave_requests),
  array[:'r_demo']::uuid[],
  'a demo employee sees only their own request'
);
select is(
  (select count(*)::int from public.leave_requests where id in (:'r_real', :'r_real2')),
  0,
  'a demo employee cannot read a real colleague''s requests'
);
select is(
  (select count(*)::int from public.leave_requests where user_id = :'demo2'),
  0,
  'a demo employee cannot read another demo user''s requests'
);

-- Allowed counterpart: the real manager reads the demo request.
select tests.as_authenticated(:'mgr');
select is(
  (select count(*)::int from public.leave_requests where id = :'r_demo'),
  1,
  'a real manager reads the demo employee''s request'
);

select * from finish();
rollback;

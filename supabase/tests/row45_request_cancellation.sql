-- Access matrix row 45: `request_cancellation` (#175). The requester opens an ask against their
-- own *approved* leave. Roles: E/M/A on their own approved request ✓, any other request ✗,
-- inactive ✗, anon ✗.
--
-- The half of #175 that this file is really about is what does NOT happen: the leave stays
-- approved, its decider stays named, its days stay reserved and its Google event stays. An ask is
-- a question, and a question cannot move an answer.
begin;
select plan(18);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD') as mate \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('R45 annual', true, 20) returning id as lt \gset

select tests.create_request(:'emp', '2026-12-01', '2026-12-02', 'approved', :'mgr', null, :'lt') as ap1 \gset
select tests.create_request(:'mgr', '2026-12-08', '2026-12-09', 'approved', :'adm', null, :'lt') as ap2 \gset
select tests.create_request(:'mate', '2026-12-15', '2026-12-16', 'approved', :'mgr', null, :'lt') as ap3 \gset
select tests.create_request(:'emp', '2026-12-21', '2026-12-22', 'pending', null, null, :'lt') as pd \gset
select tests.create_request(:'emp', '2026-12-28', '2026-12-29', 'declined', :'mgr', null, :'lt') as dl \gset

-- ----------------------------------------------------------------------------- the shape
select has_function('public', 'request_cancellation', array['uuid', 'text'],
  'request_cancellation(uuid, text) exists');
select is(has_function_privilege('anon', 'public.request_cancellation(uuid, text)', 'execute'),
  false, 'anon holds no execute on it');

-- ----------------------------------------------------------------------- opening an ask
select tests.as_authenticated(:'emp');
select is((select status::text from public.request_cancellation((:'ap1')::uuid, 'Family emergency')),
  'pending', 'the ask opens pending, for an approver to answer');
select tests.as_authenticated(:'mgr');
select is((select status::text from public.request_cancellation((:'ap2')::uuid, null)),
  'pending', 'a manager can ask about their own approved leave');
select tests.reset_role();

select is(
  (select requested_by::text || '/' || coalesce(reason, '<null>') || '/'
        || (decided_by is null and decided_at is null)::text || '/' || (requested_at is not null)::text
        || '/' || (request_id = :'ap1')::text
   from public.cancellation_requests where request_id = :'ap1'),
  :'emp' || '/Family emergency/true/true/true',
  'the row records who asked, why, nothing about an answer, and which leave it is about');

-- The leave itself, unchanged in every column an approver wrote. This is AC 3 of #175 read as
-- data: the ask lives beside the decision instead of on top of it.
select is(
  (select status::text || '/' || decided_by::text || '/' || coalesce(decision_comment, '<null>')
   from public.leave_requests where id = :'ap1'),
  'approved/' || :'mgr' || '/<null>',
  'the approved decision is untouched by the ask');

-- The days are still reserved -- the same slot cannot be booked twice while the question hangs
-- open, which is the exclusion constraint never having been touched.
select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-12-01', '2026-12-02'),
  'P0001', 'overlap', 'an unanswered ask still holds the slot');
select throws_ok(
  format('select public.request_cancellation(%L, %L)', :'ap1', 'Second thought'),
  'P0001', 'already_requested', 'a second ask on the same leave is refused');
select throws_ok(
  format('select public.request_cancellation(%L)', :'pd'),
  'P0001', 'not_cancellable', 'a pending request is withdrawn, not cancelled');
select throws_ok(
  format('select public.request_cancellation(%L)', :'dl'),
  'P0001', 'not_cancellable', 'declined leave was never booked, so there is nothing to cancel');
select throws_ok(
  format('select public.request_cancellation(%L, %L)', :'ap3', 'Not mine'),
  'P0001', 'not_allowed', 'and never somebody else''s leave');
select throws_ok(
  'select public.request_cancellation(gen_random_uuid(), null)',
  'P0001', 'not_found', 'a request that does not exist reports not_found');
select tests.as_anon();
select throws_ok(
  format('select public.request_cancellation(%L)', :'ap1'),
  '42501', null, 'anon: not executable');

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.request_cancellation(%L)', :'ap1'),
  'P0001', 'not_allowed', 'a deactivated account cannot open an ask');

-- One ask per leave, and the decided ones do not count against it. Both counts are keyed to the
-- five leaves this file minted, because a db test may only count rows it created (#382) -- once
-- the UI can raise an ask, a dev stack will hold rows from somebody else's session.
select tests.reset_role();
select is((select count(*)::int from public.cancellation_requests
   where request_id in (:'ap1', :'ap2', :'ap3', :'pd', :'dl')), 2,
  'two leaves asked about, two rows');
select is(
  (select count(*)::int from public.cancellation_requests
   where status = 'pending' and request_id in (:'ap1', :'ap2', :'ap3', :'pd', :'dl')), 2,
  'both still pending');

-- No client writes, and -- deliberately, for now -- no read either. `cancellation_requests` has
-- RLS on and no select policy: who may see an ask is the approvals page's question, and it
-- arrives as its own access-matrix row with the UI half of #175. Until then the only route to an
-- ask is the RPC that made it. A missing policy hides rows; it does not leak them.
select tests.as_authenticated(:'emp');
select throws_ok(
  format('insert into public.cancellation_requests (request_id, requested_by) values (%L, %L)',
    :'ap1', :'emp'),
  '42501', null, 'authenticated cannot insert an ask directly');
select is((select count(*)::int from public.cancellation_requests), 0,
  'and cannot read one yet either');
select tests.reset_role();

select * from finish();
rollback;

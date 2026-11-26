-- Access matrix row 46: `decide_cancellation` (#175). Only an approver who is not the person
-- asking, under the same who-may-decide rule as `decide_leave_request`: a manager answers an
-- employee or admin, an admin answers an employee or manager, a manager never answers a peer and
-- nobody answers themselves. Saying yes moves the leave to `cancelled` and returns the days;
-- saying no leaves every column of the decision as it was.
--
-- Row numbers are one sequence across both specs, and 43 belongs to #180 in #450 -- see the note
-- at the foot of `specs/001-mvp/contracts/access-matrix.md`.
begin;
select plan(27);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD') as mate \gset
select tests.create_user('manager', 'QLD') as peer \gset
select tests.create_user('manager', 'NSW', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('R46 annual', true, 20) returning id as lt \gset

select tests.create_request(:'emp', '2026-12-01', '2026-12-02', 'approved', :'mgr', null, :'lt') as ap_emp \gset
select tests.create_request(:'mgr', '2026-12-08', '2026-12-09', 'approved', :'adm', null, :'lt') as ap_mgr \gset
select tests.create_request(:'adm', '2026-12-15', '2026-12-16', 'approved', :'mgr', null, :'lt') as ap_adm \gset
select tests.create_request(:'mate', '2026-12-22', '2026-12-23', 'approved', :'mgr', null, :'lt') as ap_mate \gset
select tests.create_request(:'peer', '2027-01-05', '2027-01-06', 'approved', :'adm', null, :'lt') as ap_peer \gset

-- One open ask per leave, each raised by its own requester through the real RPC.
select tests.as_authenticated(:'emp');
select id from public.request_cancellation((:'ap_emp')::uuid, 'Family emergency') \gset a_emp_
select tests.as_authenticated(:'mgr');
select id from public.request_cancellation((:'ap_mgr')::uuid) \gset a_mgr_
select tests.as_authenticated(:'adm');
select id from public.request_cancellation((:'ap_adm')::uuid) \gset a_adm_
select tests.as_authenticated(:'mate');
select id from public.request_cancellation((:'ap_mate')::uuid, 'Moving house') \gset a_mate_
select tests.as_authenticated(:'peer');
select id from public.request_cancellation((:'ap_peer')::uuid) \gset a_peer_
select tests.reset_role();

-- ----------------------------------------------------------------------------- the shape
select has_function('public', 'decide_cancellation',
  array['uuid', 'request_status', 'text'],
  'decide_cancellation(cancellation, outcome, comment) exists');
select is(has_function_privilege('anon',
  'public.decide_cancellation(uuid, public.request_status, text)', 'execute'),
  false, 'anon holds no execute on it');

-- ------------------------------------------------------------------ yes: the leave moves
select tests.as_authenticated(:'mgr');
select is((select status::text from public.decide_cancellation((:'a_emp_id')::uuid, 'approved', 'Go ahead')),
  'approved', 'a manager can answer an employee ask');
select tests.reset_role();

select is(
  (select status::text || '/' || decided_by::text || '/' || (decided_at is not null)::text
        || '/' || coalesce(decision_comment, '<null>')
   from public.cancellation_requests where id = :'a_emp_id'),
  'approved/' || :'mgr' || '/true/Go ahead',
  'the answer names who said it, when, and what they said');

select is((select status::text from public.leave_requests where id = :'ap_emp'), 'cancelled',
  'a yes moves the leave itself');

-- The approver who answered the ask is not the approver who granted the leave, and granting it
-- is not undone by cancelling it: `decided_by` still says who approved the original request.
select is((select decided_by::text from public.leave_requests where id = :'ap_emp'), :'mgr',
  'and the original decision keeps its decider');

-- The days come back, proved the same way as a withdrawal: the slot is bookable again through
-- the real submit RPC, which is the exclusion index and the balance sum answering together.
select tests.as_authenticated(:'emp');
select lives_ok(
  format('select public.submit_leave_request(%L, %L, %L, %L)', :'lt', '2026-12-01', '2026-12-02', 'Again'),
  'a cancelled slot is free again');
select throws_ok(
  format('select public.request_cancellation(%L, %L)', :'ap_emp', 'Second thought'),
  'P0001', 'not_cancellable', 'and cancelled leave cannot be cancelled a second time');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'a_emp_id', 'approved', null),
  'P0001', 'already_decided', 'an answered ask cannot be answered twice');
select tests.reset_role();

-- ------------------------------------------------------------------- no: the leave stays
select tests.as_authenticated(:'mgr');
select is((select status::text from public.decide_cancellation((:'a_mate_id')::uuid, 'declined', 'Peak week')),
  'declined', 'a manager can decline an employee ask');
select tests.reset_role();

select is((select status::text from public.leave_requests where id = :'ap_mate'), 'approved',
  'a no leaves the leave booked');
select is(
  (select status::text || '/' || decided_by::text || '/' || coalesce(decision_comment, '<null>')
   from public.cancellation_requests where id = :'a_mate_id'),
  'declined/' || :'mgr' || '/Peak week',
  'and the no is recorded against the ask, not the leave');

-- The days are still gone, which is the point of asking before cancelling.
select tests.as_authenticated(:'mate');
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-12-22', '2026-12-23'),
  'P0001', 'overlap', 'a declined ask still holds the slot');
select tests.reset_role();

-- --------------------------------------------------------------------------- who may not
select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'a_mgr_id', 'approved', null),
  'P0001', 'own_request', 'nobody answers their own ask');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'a_peer_id', 'approved', null),
  'P0001', 'not_allowed', 'a manager does not answer another manager');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'a_adm_id', 'pending', null),
  'P0001', 'invalid_outcome', 'and pending is not an answer');
select throws_ok(
  'select public.decide_cancellation(gen_random_uuid(), ''approved'', null)',
  'P0001', 'not_found', 'an ask that does not exist reports not_found');
select tests.as_anon();
select throws_ok(
  format('select public.decide_cancellation(%L, %L)', :'a_adm_id', 'approved'),
  '42501', null, 'anon: not executable');

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.decide_cancellation(%L, %L)', :'a_adm_id', 'approved'),
  'P0001', 'not_allowed', 'a deactivated account cannot answer');
select tests.as_authenticated(gen_random_uuid());
select throws_ok(
  format('select public.decide_cancellation(%L, %L)', :'a_adm_id', 'approved'),
  'P0001', 'not_allowed', 'a user with no profile is refused');

-- An admin answering a manager is the other half of the matrix, and the only way to show a rule
-- that is a pair of clauses is to answer both: the caller_role that refuses a peer permits a
-- manager's ask, and still refuses its own owner.
select tests.as_authenticated(:'adm');
select is((select status::text from public.decide_cancellation((:'a_mgr_id')::uuid, 'approved', null)),
  'approved', 'an admin answers a manager ask');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'a_adm_id', 'declined', 'Self'),
  'P0001', 'own_request', 'and an admin cannot answer their own');

select tests.reset_role();

-- --------------------------------------------------------------------- what the refusals left
-- Two asks were never answered -- `a_peer_id` by anyone, `a_adm_id` only by the calls that were
-- refused -- and the leaves they hang over were never moved.
select is((select count(*)::int from public.cancellation_requests), 5,
  'five asks were opened, five rows exist');
select is((select count(*)::int from public.cancellation_requests where status = 'pending'), 2,
  'two are still open');
select is((select status::text from public.leave_requests where id = :'ap_peer'), 'approved',
  'and its leave was never moved by the calls that were refused');

-- ------------------------------------------------------------------------ the checks, at rest
-- Both arms of the answer, written from data rather than through the RPC. `:'adm'` is the
-- requester of `a_adm_id`, so this fails `decided_by <> requested_by` and nothing else: the row
-- is being settled, not left open.
select dies_ok(
  format('update public.cancellation_requests set status = ''approved'', decided_at = now(),'
    || ' decided_by = requested_by where id = %L', :'a_adm_id'),
  'an ask cannot be answered by the person who made it');

select dies_ok(
  format('update public.cancellation_requests set decided_at = now() where id = %L', :'a_peer_id'),
  'an open ask cannot carry an answer timestamp');

select * from finish();
rollback;

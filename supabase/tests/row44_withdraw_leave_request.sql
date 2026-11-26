-- Access matrix row 44: `withdraw_leave_request` (#175). The requester closes their own pending
-- request and the days come back at once. Roles: E/M/A on their own ✓, another person's request
-- ✗, inactive ✗, anon ✗. A request an approver has already answered cannot be withdrawn, and a
-- withdrawal is not a decision -- `decided_by` stays null, which is the arm
-- `leave_requests_decision_shape_check` exists to allow.
--
-- Row numbers are one sequence across both specs: 001 holds 1-27, 002 holds 28-42, and 43 is
-- #180's report pair. 43 sat unmerged in #450 when this file was written, which is why #175 starts
-- at 44 -- see the note at the foot of `specs/001-mvp/contracts/access-matrix.md`.
begin;
select plan(19);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset
select tests.create_user('employee', 'QLD') as mate \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('R44 annual', true, 20) returning id as lt \gset

-- ----------------------------------------------------------------------------- the shape
select has_function('public', 'withdraw_leave_request', array['uuid'],
  'withdraw_leave_request(uuid) exists');
-- The catalog function with a full signature rather than pgTAP's wrapper, because
-- `row40_audit_private_functions.sql` already proves that form on main.
select is(has_function_privilege('anon', 'public.withdraw_leave_request(uuid)', 'execute'), false,
  'anon holds no execute on it');

-- ------------------------------------------------------------------ the happy path, E/M/A
select tests.create_request(:'emp', '2026-09-07', '2026-09-08', 'pending', null, null, :'lt') as e_r \gset
select tests.create_request(:'mgr', '2026-09-14', '2026-09-15', 'pending', null, null, :'lt') as m_r \gset
select tests.create_request(:'adm', '2026-09-21', '2026-09-22', 'pending', null, null, :'lt') as a_r \gset
select tests.create_request(:'mate', '2026-09-28', '2026-09-29', 'pending', null, null, :'lt') as mate_r \gset
select tests.create_request(:'emp', '2026-10-05', '2026-10-06', 'approved', :'mgr', null, :'lt') as appr \gset

select tests.as_authenticated(:'emp');
select is((select status::text from public.withdraw_leave_request((:'e_r')::uuid)), 'withdrawn',
  'an employee withdraws their own pending request');
select tests.as_authenticated(:'mgr');
select is((select status::text from public.withdraw_leave_request((:'m_r')::uuid)), 'withdrawn',
  'a manager withdraws their own');
select tests.as_authenticated(:'adm');
select is((select status::text from public.withdraw_leave_request((:'a_r')::uuid)), 'withdrawn',
  'an admin withdraws their own');
select tests.reset_role();

-- The row it leaves behind: withdrawn, no decider named, and a timestamp for the audit entry to
-- carry. A withdrawal has no comment, because there is no decision to comment on.
select is(
  (select status::text || '/' || coalesce(decided_by::text, '<null>') || '/'
        || (decided_at is not null)::text || '/' || coalesce(decision_comment, '<null>')
   from public.leave_requests where id = :'e_r'),
  'withdrawn/<null>/true/<null>',
  'a withdrawal names no decider and keeps no decision comment');

-- The days come back, proved by behaviour rather than arithmetic: the same slot can be booked
-- again through the real submit RPC, which is the partial exclusion index and the balance sum
-- answering together.
select tests.as_authenticated(:'emp');
select lives_ok(
  format('select public.submit_leave_request(%L, %L, %L, %L)', :'lt', '2026-09-07', '2026-09-08', 'Again'),
  'the withdrawn dates are free again');
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-09-07', '2026-09-08'),
  'P0001', 'overlap', 'and the fresh submission is now the row that reserves them');
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'m_r'),
  'P0001', 'not_allowed', 'one person cannot withdraw another person''s request');
select throws_ok(
  'select public.withdraw_leave_request(gen_random_uuid())',
  'P0001', 'not_found', 'a request that does not exist reports not_found');
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'e_r'),
  'P0001', 'already_decided', 'a request already withdrawn cannot be withdrawn again');
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'appr'),
  'P0001', 'already_decided', 'an approver answered this one, so there is nothing to withdraw');
select tests.as_anon();
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'e_r'),
  '42501', null, 'anon: not executable');

-- A stranger's answer is `not_allowed`, not a status message: the owner test runs first, so an
-- employee probing another id learns only that it is not theirs. `decide_leave_request` has the
-- same shape (row 16), and `tests.create_request` seeds the row without either of them seeing it.
select tests.as_authenticated(:'mate');
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'appr'),
  'P0001', 'not_allowed', 'a colleague cannot withdraw it either, decided or not');
select lives_ok(
  format('select public.withdraw_leave_request(%L)', :'mate_r'),
  'their own, undisturbed');

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.withdraw_leave_request(%L)', :'e_r'),
  'P0001', 'not_allowed', 'a deactivated account is refused even its own request');
select tests.reset_role();

-- --------------------------------------------------------------------- the check, at rest
-- The new arm, from data rather than through the RPC. `:'mgr'` is not the owner of `e_r`, so
-- `decided_by <> user_id` cannot be what refuses this -- only the withdrawn arm can.
select dies_ok(
  format('update public.leave_requests set decided_by = %L where id = %L', :'mgr', :'e_r'),
  'a withdrawn request cannot acquire a decider');
select is(
  (select decided_by from public.leave_requests where id = :'e_r'), null,
  'and the refused write left the row alone');

-- Proof that this migration relaxed a rule instead of tightening one. The old check let an
-- approved row carry a timestamp with no decider; `and` in the `else` arm would not have, and
-- `tests.create_request` can produce exactly that shape.
select lives_ok(
  format('update public.leave_requests set decided_by = null where id = %L', :'appr'),
  'an approved request still passes with only decided_at filled');

select * from finish();
rollback;

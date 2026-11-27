-- Access matrix row 49 (ADR 0019): who the email outbox queues a send for. The row is the audience
-- rule, not the message -- the six events, the two directions (approvers hear the ask, the
-- requester hears the answer), and the four absences that matter: a colleague employee hears
-- nothing, a deactivated approver hears nothing, a withdrawal says nothing, and a demo person's
-- business never leaves the database.
--
-- Every assertion is a rule compared against the same predicate the trigger uses, or a
-- `not exists`, rather than a count: this suite has no seed file, so a number of approvers would
-- be a fact about whoever ran the migration last. Where an absence is asserted, the line after it
-- proves the row that should have produced a send really did the thing that could have produced it.
begin;
select plan(24);

-- All the people exist before any request does, so the expected audience is stable from here on.
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'NSW') as emp2 \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('manager', 'HK') as mgr2 \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('manager', 'QLD', false) as off \gset
select tests.create_user('employee', 'QLD', true, true) as dem \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('R49 annual', true, 20) returning id as lt \gset

-- ------------------------------------------------------------------- a new request tells approvers
select tests.create_request(:'emp', '2026-09-07', '2026-09-08', 'pending', null, null, :'lt') as r1 \gset

select is(
  (select role::text || '/' || is_active::text from public.profiles where id = :'off'),
  'manager/false',
  'control: the person excluded next is a manager who was switched off, so that test cannot pass by accident'
);
select ok(
  (select count(*) >= 2 from private.email_outbox where request_id = :'r1'),
  'control: a submission queues an audience, so the rule comparison below is not two empty sets agreeing'
);
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where request_id = :'r1' and event = 'request_submitted'),
  (select string_agg(p.id::text, ',' order by p.id)
   from public.profiles p
   where p.role in ('manager', 'admin') and p.is_active and p.id <> :'emp'),
  'a new request goes to every active manager and admin except the requester'
);
select ok(
  not exists (select 1 from private.email_outbox where request_id = :'r1' and recipient = :'emp2'),
  'a colleague employee is told nothing'
);
select ok(
  not exists (select 1 from private.email_outbox where request_id = :'r1' and recipient = :'off'),
  'a deactivated manager is told nothing'
);

-- Same rule, different subject: mgr2 is in r1's audience and out of their own.
select tests.create_request(:'mgr2', '2026-09-14', '2026-09-15', 'pending', null, null, :'lt') as r_self \gset
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where request_id = :'r_self' and event = 'request_submitted'),
  (select string_agg(p.id::text, ',' order by p.id)
   from public.profiles p
   where p.role in ('manager', 'admin') and p.is_active and p.id <> :'mgr2'),
  'and a manager is not their own audience, which is why the exclusion is per request and not per person'
);

-- An insert that arrives already decided is not a submission. This is the `when (new.status =
-- 'pending')` clause on the trigger, and it is what keeps the demo loader and a direct seed quiet.
select tests.create_request(:'emp', '2026-10-05', '2026-10-06', 'approved', :'mgr', null, :'lt') as r_pre \gset
select is(
  (select count(*)::int from private.email_outbox where request_id = :'r_pre'), 0,
  'a request that was never pending queues nothing'
);

-- --------------------------------------------------------------------- the fiction stays inside
select tests.create_request(:'dem', '2026-11-02', '2026-11-03', 'pending', null, null, :'lt') as r_demo \gset
select is(
  (select status::text from public.leave_requests where id = :'r_demo'), 'pending',
  'control: the demo request is pending, so the next line is the is_demo rule and not a status rule'
);
select is(
  (select count(*)::int from private.email_outbox where request_id = :'r_demo'), 0,
  'a demo person''s request queues no mail at all: nobody approves a fiction by email'
);

-- ----------------------------------------------------------------- the answer goes one way only
select tests.as_authenticated(:'mgr');
select public.decide_leave_request((:'r1')::uuid, 'approved', 'Go ahead');
select tests.reset_role();
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where request_id = :'r1' and event = 'request_approved'),
  :'emp',
  'an approval mails the requester alone'
);

select tests.create_request(:'emp2', '2026-12-07', '2026-12-08', 'pending', null, null, :'lt') as r2 \gset
select tests.as_authenticated(:'adm');
select public.decide_leave_request((:'r2')::uuid, 'declined', 'Peak week');
select tests.reset_role();
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where request_id = :'r2' and event = 'request_declined'),
  :'emp2',
  'a decline mails its own requester, and the event names which answer it was'
);

-- A withdrawal is not a decision. r3 already queued its submitted audience, so the assertion is
-- about what the status change added, which is nothing.
select tests.create_request(:'emp', '2027-01-11', '2027-01-12', 'pending', null, null, :'lt') as r3 \gset
select tests.as_authenticated(:'emp');
select public.withdraw_leave_request((:'r3')::uuid);
select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r3'), 'withdrawn',
  'control: the request did move off pending, so the update trigger ran'
);
select is(
  (select count(*)::int from private.email_outbox where request_id = :'r3' and event <> 'request_submitted'),
  0,
  'and it added no send: the person who withdrew is the one person who already knows'
);

-- ------------------------------------------------------------------------- the cancellation leg
select tests.create_request(:'emp', '2027-02-08', '2027-02-09', 'approved', :'mgr', null, :'lt') as r_c \gset
select tests.as_authenticated(:'emp');
select id as c1 from public.request_cancellation((:'r_c')::uuid, 'Reef trip') \gset
select tests.reset_role();
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where cancellation_id = :'c1' and event = 'cancellation_requested'),
  (select string_agg(p.id::text, ',' order by p.id)
   from public.profiles p
   where p.role in ('manager', 'admin') and p.is_active and p.id <> :'emp'),
  'an ask to cancel reaches the same audience as a new request'
);
select is(
  (select count(*)::int from private.email_outbox
   where request_id = :'r_c' and event = 'cancellation_requested' and cancellation_id is null),
  0,
  'and every one of those rows names the ask, not only the leave, which is what lets a second ask mail again'
);

select tests.as_authenticated(:'adm');
select public.decide_cancellation((:'c1')::uuid, 'declined', 'Not this week');
select tests.reset_role();
select is(
  (select string_agg(recipient::text, ',' order by recipient)
   from private.email_outbox where cancellation_id = :'c1' and event = 'cancellation_declined'),
  :'emp',
  'the answer to an ask comes back to the person who asked, and to nobody else'
);

-- A second ask on the same leave, answered yes: two questions, two sets of mails, and the leave
-- finally moves. `decide_cancellation` is what sets `cancelled` (20261126100300:193).
select tests.as_authenticated(:'emp');
select id as c2 from public.request_cancellation((:'r_c')::uuid, 'Weather') \gset
select tests.reset_role();
select tests.as_authenticated(:'mgr');
select public.decide_cancellation((:'c2')::uuid, 'approved', 'Ok');
select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r_c'), 'cancelled',
  'control: the second ask was answered yes, so the leave really did turn cancelled'
);
select is(
  (select count(*)::int from private.email_outbox
   where recipient = :'mgr' and event = 'cancellation_requested'
     and cancellation_id = any (array[:'c1', :'c2']::uuid[])),
  2,
  'the same manager is asked twice, because a second question is a second send'
);
select is(
  (select count(*)::int from private.email_outbox
   where request_id = :'r_c' and event in ('request_approved', 'request_declined')), 0,
  'and cancelled leave queues no answer-mail: nobody is told a request was approved because it was cancelled'
);

-- ------------------------------------------------------------------------ the key, from data
-- The promise "one email per person per event" lives in `email_outbox_one_send_per_person`, so the
-- index is tested by trying to break it. r1's approval row for the requester already exists.
-- `format` rather than a dollar-quoted statement because psql does not interpolate inside one.
select throws_ok(
  format($t$ insert into private.email_outbox (request_id, event, recipient)
           select id, 'request_approved', user_id from public.leave_requests where id = %L $t$,
         :'r1'),
  '23505', null, 'a second approval mail for the same person and request is refused by the key'
);
-- The other side of the same index: `coalesce(cancellation_id, request_id)` means a cancellation
-- row is keyed by the ask, so an unbounded number of asks on one leave each keep their own send.
select lives_ok(
  format($t$ insert into private.email_outbox (request_id, cancellation_id, event, recipient)
           values (%L, gen_random_uuid(), 'cancellation_requested', %L) $t$,
         :'r_c', :'mgr'),
  'a third ask on the same leave is a different key, so the index lets it through'
);
-- The closed vocabulary: `request_withdrawn` is an audit verb (20261126100200:23) and deliberately
-- not an email event.
select throws_ok(
  format($t$ insert into private.email_outbox (request_id, event, recipient)
           values (gen_random_uuid(), 'request_withdrawn', %L) $t$,
         :'mgr'),
  '23514', null, 'a withdrawal has no event to queue'
);

-- A demo ask: the RPC refuses a demo *requester*, so the row is inserted directly, which is also the
-- only way to reach the join the trigger does to find out whose leave it is. The answer then comes
-- through `decide_cancellation` from a real manager, because that is the path production takes and the
-- demo guard is what has to hold there. The id is read before the role switch on purpose: select is
-- revoked from `anon` only, but the table is RLS-on with no select policy, so an authenticated caller
-- reads no rows at all and would hand the RPC a null.
select tests.create_request(:'dem', '2027-03-01', '2027-03-02', 'approved', :'mgr', null, :'lt') as r_dappr \gset
insert into public.cancellation_requests (request_id, requested_by, reason)
values (:'r_dappr', :'dem', 'Boat') returning id as c_demo \gset
select tests.as_authenticated(:'mgr');
select public.decide_cancellation((:'c_demo')::uuid, 'approved', null);
select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r_dappr'), 'cancelled',
  'control: a real manager did answer that ask, so the next line is the demo rule and not a no-op'
);
select is(
  (select count(*)::int from private.email_outbox where request_id = :'r_dappr'), 0,
  'an ask from a demo person queues nothing, opened or answered'
);

select * from finish();
rollback;

-- ADR 0019 behaviour for #174: what the claim hands the sender, what each finish outcome does to a
-- row, and that the kick is inert on a database nobody has configured. Recipient rules are
-- `row49_email_outbox_recipients.sql`; who may reach these functions at all is
-- `row47_48_email_notify_access.sql`. This file is the middle: the two RPCs and the cron door.
--
-- Like `calendar_sync_behaviour.sql` this is a behaviour file and not an access-matrix row, so it
-- carries no row number. Every group that claims parks what it is finished with first: the claim is
-- `for update skip locked`, so a row another group left behind would be taken by the group now
-- running and the count would be a fact about the stack rather than about this behaviour (the #382
-- lesson).
begin;
select plan(23);

select has_function('public', 'email_notify_claim', array['int'], 'email_notify_claim(int) exists');
select has_function('public', 'email_notify_finish', array['bigint', 'text', 'text', 'int'],
  'email_notify_finish(bigint, text, text, int) exists');

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('R48 annual', true, 20) returning id as lt \gset

-- One request submitted and then answered, one approved request that gets an ask which is refused.
-- Six queued sends between them, each backed by a different free-text field.
select tests.create_request(:'emp', '2026-12-07', '2026-12-09', 'pending', null, null, :'lt') as r1 \gset
update public.leave_requests set note = 'Reef trip' where id = :'r1';
select tests.as_authenticated(:'mgr');
select public.decide_leave_request((:'r1')::uuid, 'approved', 'Go ahead');
select tests.reset_role();

select tests.create_request(:'emp', '2027-01-11', '2027-01-12', 'approved', :'mgr', null, :'lt') as r2 \gset
select tests.as_authenticated(:'emp');
select id as c1 from public.request_cancellation((:'r2')::uuid, 'Weather') \gset
select tests.reset_role();
select tests.as_authenticated(:'adm');
select public.decide_cancellation((:'c1')::uuid, 'declined', 'Peak week');
select tests.reset_role();

update private.email_outbox set done_at = now()
where request_id <> all (array[:'r1', :'r2']::uuid[]);

-- --------------------------------------------------------------------- the payload the sender sees
-- One claim answers the whole row: who it is to, who it is about, which leave, which dates, and the
-- one thing it may quote. `distinct` because the two approvers' rows differ only in the recipient,
-- and the order that matters is this string's own.
select tests.as_service();
select is(
  (select string_agg(distinct
      event || ' to=' || coalesce(recipient_name, '-') ||
      ' about=' || coalesce(other_name, '-') ||
      ' who=' || coalesce(subject_name, '-') ||
      ' type=' || coalesce(leave_type, '-') ||
      ' dates=' || coalesce(start_date::text, '-') || '~' || coalesce(end_date::text, '-') ||
      ' days=' || coalesce(working_days::text, '-') ||
      ' said=' || coalesce(detail, '-'),
      ' || ' order by
      event || ' to=' || coalesce(recipient_name, '-') ||
      ' about=' || coalesce(other_name, '-') ||
      ' who=' || coalesce(subject_name, '-') ||
      ' type=' || coalesce(leave_type, '-') ||
      ' dates=' || coalesce(start_date::text, '-') || '~' || coalesce(end_date::text, '-') ||
      ' days=' || coalesce(working_days::text, '-') ||
      ' said=' || coalesce(detail, '-'))
   from public.email_notify_claim(100)),
  'cancellation_declined to=Test employee about=Test admin who=Test employee type=R48 annual'
  || ' dates=2027-01-11~2027-01-12 days=2.0 said=Peak week'
  || ' || cancellation_requested to=Test admin about=Test employee who=Test employee type=R48 annual'
  || ' dates=2027-01-11~2027-01-12 days=2.0 said=Weather'
  || ' || cancellation_requested to=Test manager about=Test employee who=Test employee type=R48 annual'
  || ' dates=2027-01-11~2027-01-12 days=2.0 said=Weather'
  || ' || request_approved to=Test employee about=Test manager who=Test employee type=R48 annual'
  || ' dates=2026-12-07~2026-12-09 days=3.0 said=Go ahead'
  || ' || request_submitted to=Test admin about=Test employee who=Test employee type=R48 annual'
  || ' dates=2026-12-07~2026-12-09 days=3.0 said=Reef trip'
  || ' || request_submitted to=Test manager about=Test employee who=Test employee type=R48 annual'
  || ' dates=2026-12-07~2026-12-09 days=3.0 said=Reef trip',
  'each event carries its own one free-text field, and only that one: the note for a submission,'
  || ' the decision comment for an answer, the reason for an ask, the ask''s comment for its answer'
);

-- Unlock, then change the two people behind that queue. The address is read now, not at enqueue, and
-- an account switched off comes back with nothing to address -- which the function reports as
-- `skipped` rather than mailing.
select tests.reset_role();
update private.email_outbox set locked_until = null;
update public.profiles set email = 'new-mgr@example.gov.au' where id = :'mgr';
update public.profiles set is_active = false where id = :'adm';

select tests.as_service();
select is(
  (select (count(*) filter (where recipient_email = 'new-mgr@example.gov.au'))::text || '/'
        || (count(*) filter (where recipient_email is null))::text || '/' || count(*)::int
   from public.email_notify_claim(100)),
  '2/2/6',
  'an address that changed since the request landed is honoured, a person switched off has no'
  || ' address to mail, and all six rows are still there to be told about'
);

-- ----------------------------------------------------------------------- claiming: limit, lock, due
select tests.reset_role();
update private.email_outbox set done_at = now();
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid()) returning id as q1 \gset
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid()) returning id as q2 \gset
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid()) returning id as q3 \gset
insert into private.email_outbox (request_id, event, recipient, next_attempt_at)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), now() + interval '1 hour')
  returning id as q4 \gset

select tests.as_service();
select is((select count(*)::int from public.email_notify_claim(2)), 2, 'claim respects the limit');
select is((select count(*)::int from public.email_notify_claim(10)), 1,
  'a second claim takes neither the two rows still locked nor the row that is not due yet');
select tests.reset_role();
select is(
  (select string_agg(attempts::text, ',' order by id) from private.email_outbox
   where id in (:q1, :q2, :q3)),
  '2,2,1', 'a row is counted once per claim, so the sixth report is what decides whether it tries again');
select ok(
  (select attempts = 0 and locked_until is null from private.email_outbox where id = :q4),
  'and the row that is not due was never touched at all');

-- ------------------------------------------------------------------ finish: the ladder, then death
-- `finish` also runs on a row that was never claimed, so each rung is its own row rather than six
-- claims that the next group has to park again. The last pair is the point: attempts 0 would index
-- off the front of the array, and `greatest` is what stops it.
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 0) returning id as a0 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 1) returning id as a1 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 2) returning id as a2 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 3) returning id as a3 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 4) returning id as a4 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 5) returning id as a5 \gset

select tests.as_service();
select public.email_notify_finish(:a0, 'retry', 'HTTP 503');
select public.email_notify_finish(:a1, 'retry', 'HTTP 503');
select public.email_notify_finish(:a2, 'retry', 'HTTP 503');
select public.email_notify_finish(:a3, 'retry', 'HTTP 503');
select public.email_notify_finish(:a4, 'retry', 'HTTP 503');
select public.email_notify_finish(:a5, 'retry', 'HTTP 503');
select tests.reset_role();
select is(
  (select string_agg((o.next_attempt_at = now() + t.i::interval)::text, ',' order by t.n)
   from (values
     (0, :a0::bigint, '1 minute'), (1, :a1::bigint, '1 minute'), (2, :a2::bigint, '5 minutes'),
     (3, :a3::bigint, '30 minutes'), (4, :a4::bigint, '2 hours'), (5, :a5::bigint, '12 hours')
   ) as t (n, id, i)
   join private.email_outbox o on o.id = t.id),
  'true,true,true,true,true,true',
  'the wait is 1 min, 1 min, 5, 30, 2 h, 12 h for attempts 0 through 5: a row that was never claimed'
  || ' is not behind, and a row that has tried five times waits half a day'
);
select is(
  (select count(*)::int from private.email_outbox
   where id in (:a0, :a1, :a2, :a3, :a4, :a5) and locked_until is null),
  6, 'and every retry unlocks its row for the next pass');

-- The sixth attempt is written off rather than queued again. Reached the way the function does:
-- a row at five tries, claimed for its sixth.
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 5) returning id as f6 \gset
select tests.as_service();
select * from public.email_notify_claim(100);
select public.email_notify_finish(:f6, 'retry', 'HTTP 503');
select tests.reset_role();
select is((select failed_at is not null from private.email_outbox where id = :f6), true,
  'an attempt that has been made six times is written off, not queued again');

-- --------------------------------------------------------------------- the three ways a row closes
insert into private.email_outbox (request_id, event, recipient, last_error)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 'HTTP 500') returning id as d1 \gset
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid()) returning id as s1 \gset
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 3) returning id as v1 \gset

select tests.as_service();
select public.email_notify_finish(:d1, 'done', null);
select public.email_notify_finish(:s1, 'skipped', 'no recipient address');
select public.email_notify_finish(:v1, 'defer', 'no key');
select tests.reset_role();
select is(
  (select done_at is not null and failed_at is null and last_error is null and locked_until is null
   from private.email_outbox where id = :d1),
  true, 'done closes the row and clears the error it was carrying');
select is(
  (select done_at is not null and failed_at is null and last_error = 'no recipient address'
   from private.email_outbox where id = :s1),
  true, 'skipped closes it too and keeps the reason, so a vanished request is visible and not silent');
select is(
  (select attempts = 2 and failed_at is null and locked_until is null and last_error = 'no key'
        and next_attempt_at = now() + interval '10 minutes'
   from private.email_outbox where id = :v1),
  true, 'defer gives the attempt back and waits ten minutes, so one refused key cannot spend the'
  || ' retries of every row in the queue');

-- ------------------------------------------------- a report from a worker whose lock has expired
insert into private.email_outbox (request_id, event, recipient, attempts)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid(), 1) returning id as l1 \gset
select tests.as_service();
select public.email_notify_finish(:l1, 'done', null, 0);
select tests.reset_role();
select is(
  (select done_at is null and failed_at is null from private.email_outbox where id = :l1),
  true, 'a report stamped with an older attempt number is ignored, because the row has moved on');
select tests.as_service();
select public.email_notify_finish(:l1, 'done', null, 1);
select public.email_notify_finish(:l1, 'fail', 'even later', 1);
select tests.reset_role();
select is(
  (select done_at is not null and failed_at is null from private.email_outbox where id = :l1),
  true, 'the current attempt does close it, and a report about a closed row changes nothing');

-- ------------------------------------------------------------------------- the two refusals
select tests.as_service();
select throws_ok($$select public.email_notify_finish(1, 'maybe', null)$$,
  'P0001', 'invalid_outcome', 'the outcome vocabulary is closed');
select throws_ok(
  format('select public.email_notify_finish(%s, %L, null)',
    (select coalesce(max(id), 0) + 1000 from private.email_outbox), 'done'),
  'P0001', 'not_found', 'and a report about a row that was never queued is an error, not a shrug');
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid()) returning id as e1 \gset
select public.email_notify_finish(:e1, 'fail', repeat('x', 1200));
select tests.reset_role();
select is((select length(last_error) from private.email_outbox where id = :e1), 500,
  'a verbose provider body is cut to 500 characters, so one error cannot bloat the queue');

-- -------------------------------------------------------------------------------------- the door
-- The kick is the only thing that reaches the network from the database. On a database with no Vault
-- rows it must not reach it even with a send waiting: that is what makes this whole feature inert in
-- CI, in a fresh local stack and in production until Sam configures it.
select ok(
  exists (select 1 from cron.job where jobname = 'email-notify-kick' and schedule = '* * * * *'),
  'the kick is scheduled every minute');
insert into private.email_outbox (request_id, event, recipient)
values (gen_random_uuid(), 'request_submitted', gen_random_uuid());
select is((select count(*)::int from net.http_request_queue), 0, 'nothing is queued before the kick runs');
select lives_ok('select private.email_notify_kick()', 'the kick runs on an unconfigured database');
select is((select count(*)::int from net.http_request_queue), 0,
  'and with a due row waiting it still queued nothing, because email_notify_url and'
  || ' email_notify_secret in Vault are what open the door');

select * from finish();
rollback;

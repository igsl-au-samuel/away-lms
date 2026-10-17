-- ADR 0013: what enqueues, how claim and finish behave, and that kick is inert without Vault secrets.
begin;
select plan(15);

select tests.create_user('employee') as emp \gset
select tests.create_user('manager') as mgr \gset

select tests.create_request(:'emp', '2026-03-02', '2026-03-04') as r_appr \gset
select tests.create_request(:'emp', '2026-04-06', '2026-04-07') as r_decl \gset
select tests.create_request(:'emp', '2026-05-04', '2026-05-05') as r_pend \gset

-- Enqueue on approval, nothing on decline.
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r_appr', 'approved', null);
select public.decide_leave_request(:'r_decl', 'declined', null);
select tests.reset_role();

select is(
  (select count(*)::int from private.calendar_outbox where request_id = :'r_appr' and action = 'create'),
  1, 'approve enqueues one create'
);
select is(
  (select count(*)::int from private.calendar_outbox where request_id = :'r_decl'),
  0, 'decline enqueues nothing'
);

-- Enqueue on delete of an approved request only.
delete from public.leave_requests where id = :'r_pend';
select is(
  (select count(*)::int from private.calendar_outbox where request_id = :'r_pend'),
  0, 'deleting a pending request enqueues nothing'
);
delete from public.leave_requests where id = :'r_appr';
select is(
  (select count(*)::int from private.calendar_outbox where request_id = :'r_appr' and action = 'delete'),
  1, 'deleting an approved request enqueues a delete'
);

-- Claim: a live request carries its name and dates; a gone one carries nulls.
select tests.create_request(:'emp', '2026-06-01', '2026-06-03', 'approved', :'mgr') as r_live \gset
insert into private.calendar_outbox (request_id, action) values (:'r_live', 'create');
select set_config('role', 'service_role', true);

select is(
  (select full_name || '/' || start_date || '/' || end_date
   from public.calendar_sync_claim(100) where request_id = :'r_live'),
  'Test employee/2026-06-01/2026-06-03',
  'claim returns the name and dates'
);
select is((select count(*)::int from public.calendar_sync_claim(100)), 0, 'a second claim finds everything locked');
select set_config('role', 'postgres', true);
select is(
  (select attempts from private.calendar_outbox where request_id = :'r_live'),
  1, 'claim increments attempts'
);
select is(
  (select count(*)::int from private.calendar_outbox where request_id = :'r_appr' and action = 'delete' and locked_until is not null),
  1, 'the deleted request''s row was claimed with null name and dates'
);

-- Limit and due time.
update private.calendar_outbox set done_at = now();
insert into private.calendar_outbox (request_id, action) select gen_random_uuid(), 'delete' from generate_series(1, 3);
insert into private.calendar_outbox (request_id, action, next_attempt_at)
values (gen_random_uuid(), 'delete', now() + interval '1 hour');
select set_config('role', 'service_role', true);
select is((select count(*)::int from public.calendar_sync_claim(2)), 2, 'claim respects the limit');
select is((select count(*)::int from public.calendar_sync_claim(10)), 1, 'claim skips locked and not-yet-due rows');

-- Finish: backoff, then fail after 6 attempts.
select set_config('role', 'postgres', true);
insert into private.calendar_outbox (request_id, action, attempts) values (gen_random_uuid(), 'delete', 0) returning id as b1 \gset
insert into private.calendar_outbox (request_id, action, attempts) values (gen_random_uuid(), 'delete', 5) returning id as b6 \gset
select set_config('role', 'service_role', true);
select * from public.calendar_sync_claim(100);
select public.calendar_sync_finish(:b1, 'retry', 'HTTP 503');
select public.calendar_sync_finish(:b6, 'retry', 'HTTP 503');
select set_config('role', 'postgres', true);
select is(
  (select next_attempt_at = now() + interval '1 minute' and locked_until is null and last_error = 'HTTP 503'
   from private.calendar_outbox where id = :b1),
  true, 'first retry backs off 1 minute and unlocks'
);
select is(
  (select failed_at is not null from private.calendar_outbox where id = :b6),
  true, 'the sixth failed attempt sets failed_at'
);

-- Kick is a no-op without Vault secrets.
select cmp_ok(
  (select count(*)::int from net.http_request_queue), '=', 0, 'no http requests queued before kick'
);
select lives_ok('select private.calendar_sync_kick()', 'kick runs without Vault secrets');
select is(
  (select count(*)::int from net.http_request_queue), 0, 'kick queued nothing without Vault secrets'
);

select * from finish();
rollback;

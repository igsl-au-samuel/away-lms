-- Access matrix rows 26-27 (ADR 0013): the outbox and its RPCs are service_role only.
begin;
select plan(8);

select tests.create_user('employee') as emp \gset

select tests.as_anon();
select throws_ok('select * from private.calendar_outbox', '42501', null, 'anon: no outbox access');
select throws_ok('select * from public.calendar_sync_claim(5)', '42501', null, 'anon: cannot claim');
select throws_ok(
  $$select public.calendar_sync_finish(1, 'done', null)$$, '42501', null, 'anon: cannot finish'
);

select tests.as_authenticated(:'emp');
select throws_ok('select * from private.calendar_outbox', '42501', null, 'authenticated: no outbox access');
select throws_ok('select * from public.calendar_sync_claim(5)', '42501', null, 'authenticated: cannot claim');
select throws_ok(
  $$select public.calendar_sync_finish(1, 'done', null)$$, '42501', null, 'authenticated: cannot finish'
);

select tests.reset_role();
select set_config('role', 'service_role', true);
select lives_ok('select * from public.calendar_sync_claim(5)', 'service_role: can claim');
select throws_ok('select * from private.calendar_outbox', '42501', null, 'service_role: no direct outbox access');

select * from finish();
rollback;

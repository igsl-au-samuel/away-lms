-- Access matrix rows 47-48 (ADR 0019): the email outbox is unreachable and its two RPCs belong to
-- service_role alone. Row 47 is the table, the four enqueue trigger functions and the cron kick;
-- row 48 is the claim/finish pair the Edge Function runs. The split is the one rows 26-27 drew for
-- the calendar, and it is the whole security story of #174: a person cannot enqueue a send, cancel
-- one, or read who is waiting for mail, and nothing outside a trigger can write a row.
--
-- 47 and 48 are one file because they are one decision -- who may touch the queue -- and
-- `row26_27_calendar_sync_access.sql` set that precedent.
--
-- Row numbers run one sequence across both specs: 001 holds 1-27, 002 holds 28-42, 43 is #180's
-- report pair and 44-46 are #175's -- see the note at the foot of this file's contract.
begin;
select plan(17);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset

select has_table('private', 'email_outbox', 'the outbox exists');

-- ------------------------------------------------------------------ anon and authenticated, row 47
select tests.as_anon();
select throws_ok('select * from private.email_outbox', '42501', null, 'anon: no outbox access');
select throws_ok(
  $t$ insert into private.email_outbox (request_id, event, recipient)
      select id, 'request_submitted', user_id from public.leave_requests limit 1 $t$,
  '42501', null, 'anon: cannot enqueue a send directly'
);
select throws_ok('select * from public.email_notify_claim(5)', '42501', null, 'anon: cannot claim');
select throws_ok(
  $$select public.email_notify_finish(1, 'done', null)$$, '42501', null, 'anon: cannot finish'
);
select throws_ok('select private.email_notify_kick()', '42501', null, 'anon: cannot kick');

select tests.as_authenticated(:'emp');
select throws_ok('select * from private.email_outbox', '42501', null, 'authenticated: no outbox access');
select throws_ok(
  $t$ insert into private.email_outbox (request_id, event, recipient)
      select id, 'request_submitted', user_id from public.leave_requests limit 1 $t$,
  '42501', null, 'authenticated: cannot enqueue a send directly'
);
select throws_ok(
  'select * from public.email_notify_claim(5)', '42501', null, 'authenticated: cannot claim'
);
select throws_ok(
  $$select public.email_notify_finish(1, 'done', null)$$, '42501', null,
  'authenticated: cannot finish'
);
-- A manager is the audience of every `request_submitted` row, and still cannot see the queue or
-- ring the function that empties it.
select tests.as_authenticated(:'mgr');
select throws_ok(
  'select private.email_notify_kick()', '42501', null, 'a manager cannot kick the function'
);

-- --------------------------------------------------------------------- service_role, row 48: allowed
select tests.reset_role();
select tests.as_service();
-- The allowed half of the row, and the reason the RPCs live in public: the Edge Function talks to
-- PostgREST, so it needs a callable name as well as a grant.
select lives_ok('select * from public.email_notify_claim(5)', 'service_role: can claim');
select throws_ok(
  $$select public.email_notify_finish(1, 'done', null)$$, 'P0001', 'not_found',
  'service_role: can finish, and reaches the body rather than the ACL'
);
select throws_ok(
  'select * from private.email_outbox', '42501', null, 'service_role: no direct outbox access'
);

select tests.reset_role();
select is(
  has_function_privilege('service_role', 'public.email_notify_claim(int)', 'execute'),
  true, 'the claim RPC is granted to service_role'
);
select is(
  has_function_privilege('service_role', 'public.email_notify_finish(bigint, text, text, int)', 'execute'),
  true, 'and so is the finish RPC'
);

-- The sweep behind the individual calls, in the shape row 40 established: nothing in the `email`
-- prefix is executable by an API role, so a fifth writer that forgets its revoke line is caught
-- the day it exists rather than by someone remembering to add a name here.
select is(
  (select coalesce(string_agg(p.proname || ':' || r.grantee, ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
   where n.nspname = 'private'
     and p.proname like 'email%'
     and has_function_privilege(r.grantee, p.oid::regprocedure, 'execute')),
  '',
  'no API role can execute any private.email_* function'
);

select * from finish();
rollback;

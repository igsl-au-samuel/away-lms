-- Spec 002 slice 3, A052: how `audit_my_history` behaves — keyset paging, the limit cap, and
-- what a deleted person's entries still carry.
--
-- This body used to sit behind a `to_regprocedure('public.audit_my_history(...)') is null` guard
-- that planned one skip until the RPC existed (decision 7). A055 merged as `8450da9` and deleted
-- the same guard from `row42_audit_my_history.sql`; this is the other half of that, because a
-- guard that can no longer fire is not a guard, it is a way for twelve assertions to stop running
-- without anything going red.
--
-- Every entry here carries the same created_at, and that is the point rather than a shortcut:
-- now() is fixed for the whole transaction, so 120 rows written by one test share one
-- timestamp. Order is (created_at desc, id desc), so a page boundary can only be honoured by
-- the id tie-break. A reader that compared created_at alone would return nothing for page two
-- here, and one that used id <= would repeat the boundary row — both fail on the very first
-- page. Real logs hit the same thing whenever two changes land in the same millisecond.
--
-- Counts are keyed to this file's own rows (119 submissions plus one decision = 120 entries
-- whose subject is the employee), never to a table total: three sessions share this stack.
begin;

select plan(12);

-- The two users are created with the triggers off: a real user_created entry has the new id as its
-- subject, so it would land on the employee's own trail and make it 121 rows, one more than the
-- paging arithmetic below assumes. The 119 submissions are still written for real, by the trigger.
set local session_replication_role = replica;
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
set local session_replication_role = origin;

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row52 annual', true, 20) returning id as lt \gset

-- The request the manager will decide, then 118 more so the caller's trail crosses both the
-- 50-row default and the 100-row cap. One leave type, distinct single days: the helper inserts
-- directly, which keeps the fixture cheap, and the audit trigger still writes one entry per row.
-- The `swallowed` name is literal: every statement in a pgTAP file has to answer through \gset
-- or a bare row of output lands in the TAP stream.
select tests.create_request(:'emp', '2027-01-05', '2027-01-05', 'pending', null, 1, :'lt') as req \gset
select count(*) as swallowed
from (
  select tests.create_request(:'emp', '2027-02-01'::date + n, '2027-02-01'::date + n,
                              'pending', null, 1, :'lt')
  from generate_series(1, 118) n
) s \gset

select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'req', 'approved', 'Enjoy');
select tests.reset_role();

-- What the employee's trail should hold, read as the owner so the assertions below are about
-- paging and not about visibility (row 42 covers that). The temp table is this file's own
-- expectation, computed with the order the data model defines.
create temporary table own on commit drop as
  select id, created_at from public.audit_log where subject_id = :'emp';

-- A temp table belongs to the role that made it, and the owner is pgTAP's postgres while the
-- reads below run as the employee. Without this grant the intersect statements — the expectation,
-- not the function — fail with `permission denied for table own`.
grant select on table own to authenticated;

select is((select count(*)::int from own), 120,
  'this file put 120 entries on the employee''s trail');
select is((select count(distinct created_at)::int from own), 1,
  'and they all carry one created_at, so only the id tie-break can order them');

-- The newest, and the 100th and 101st, which are the boundaries paging has to get right.
select id as newest from (select id from own order by created_at desc, id desc limit 1) t \gset
select created_at as b_at, id as b_id
from (select * from own order by created_at desc, id desc limit 1 offset 99) t \gset
select id as expect101 from (select id from own order by created_at desc, id desc limit 1 offset 100) t \gset

select tests.as_authenticated(:'emp');

select is((select count(*)::int from public.audit_my_history()), 50,
  'ask for no page and the default is 50 rows');
select is((select count(*)::int from public.audit_my_history(null, null, 5)), 5,
  'a small limit is honoured');
select is((select count(*)::int from public.audit_my_history(null, null, 500)), 100,
  'a limit above the cap comes back as 100, not as 500');

select is((select count(*)::int from (
    select id from public.audit_my_history(null, null, 100)
    intersect
    select id from (select id from own order by created_at desc, id desc limit 100) top100
  ) matched), 100,
  'the first 100 rows are the newest 100, as a set, so the sort is not inverted');

select is((select id from public.audit_my_history(null, null, 1)), :'newest'::bigint,
  'and the first row of the page is the newest entry');

select is((select id from public.audit_my_history(:'b_at', :'b_id', 1)), :'expect101'::bigint,
  'the row after the 100th is the 101st, so a tied created_at neither skips nor repeats');

select is((select count(*)::int from public.audit_my_history(:'b_at', :'b_id', 100)), 20,
  'the page after the boundary holds the remaining 20 entries');

select is((select count(*)::int from (
    select id from public.audit_my_history(null, null, 100)
    intersect
    select id from public.audit_my_history(:'b_at', :'b_id', 100)
  ) in_both), 0,
  'and no entry appears on both pages');

select tests.reset_role();

-- ---- US2-3: the log outlives the person who caused it ----
select id as dec_id from public.audit_log
  where action = 'request_approved' and entity_id = :'req' \gset

-- leave_requests.decided_by is a RESTRICT foreign key, and the only row holding this manager by it
-- is the request decided above. A decided_by-only update cannot add an entry to the trail: the
-- profiles audit trigger is UPDATE OF role/region/is_active and the requests one is UPDATE OF
-- status, so the page read below is still the same 120 rows.
update public.leave_requests set decided_by = null where decided_by = :'mgr';

delete from public.profiles where id = :'mgr';
delete from auth.users where id = :'mgr';

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_my_history() where id = :'dec_id'), 1,
  'the entry the deleted manager made is still on the employee''s page');
select is((select actor_name from public.audit_my_history() where id = :'dec_id'), 'Test manager',
  'with the name it carried when it was written, not a lookup that now finds nothing');
select tests.reset_role();

select * from finish();
rollback;

-- Spec 002 slice 4, A064: what audit_search's seven filters do, one at a time and together.
--
-- Every entry here is seeded directly into audit_log rather than produced by a real change. That is
-- a deliberate break from rows 28-35, which insist on a real event so the test also proves the
-- trigger wrote something: this file is about a query, and a query needs dates it can put on either
-- side of a boundary, a pair of rows sharing one instant, 105 rows to overflow a page and a person
-- who no longer exists. None of those are reachable through an RPC. Who writes entries is already
-- covered by slice 1 and slice 2.
--
-- Every read carries the fixture's own date window, and that is load-bearing rather than tidy. The
-- shared stack holds thousands of committed entries with a NULL source_key; an unbounded filter
-- returns the newest 50 of the whole log, and string_agg skips NULLs — so a count comes back as 50
-- where the file expects 2, and the worse failure is a set assertion printing exactly the keys it
-- wanted while 43 strangers sit in the same page unmentioned. That is issue #382's shape: a count
-- whose expected value is also what the stack produces. The window makes every page contain only rows
-- this file wrote, so the set and the count say the same thing. The two range assertions bound
-- themselves, each fixing the end it tests and closing the other at the edge of the fixture month,
-- and the May overflow block bounds May. Every instant here carries an explicit offset, so no window
-- in this file depends on the server's zone.
--
-- actor_role is filtered, not subject role: row a64-1 is an admin acting on an employee, so it
-- answers to p_role => admin and not to p_role => employee. That is what "role" means on the Audit
-- page (FR-024) and it is the one reading of the filter a reader could plausibly get wrong.
begin;
select plan(29);

-- Created with the triggers off, for the same reason the entries below are inserted rather than
-- caused: creating a user for real writes a user_created entry whose subject is that new id — the
-- very column p_person reads — and every set in this file names exactly the rows it seeds.
set local session_replication_role = replica;

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'NSW') as emp2 \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.audit_log
  (created_at, actor_id, actor_role, actor_name, action, entity, subject_id, subject_name,
   is_demo, source_key)
values
  -- an admin acting on someone else: actor and subject disagree, on role as well as on person
  (timestamptz '2031-04-01 09:00:00+00', :'adm', 'admin', 'Admin One', 'user_role_changed',
   'user', :'emp', 'Test employee', false, 'a64-1'),
  (timestamptz '2031-04-01 10:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', :'emp', 'Test employee', false, 'a64-2'),
  (timestamptz '2031-04-01 11:00:00+00', :'mgr', 'manager', 'Test manager', 'request_approved',
   'leave_request', :'emp2', 'Test employee', false, 'a64-3'),
  (timestamptz '2031-04-01 12:00:00+00', :'adm', 'admin', 'Admin One', 'allowance_set',
   'allowance', :'emp2', 'Test employee', false, 'a64-4'),
  -- nobody acted: a shared default change has no actor id, no role and no subject
  (timestamptz '2031-04-01 13:00:00+00', null, null, 'System', 'leave_type_default_changed',
   'leave_type', null, null, true, 'a64-5'),
  -- the last two share one instant, so only id can order them
  (timestamptz '2031-04-01 15:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', :'emp', 'Test employee', true, 'a64-6'),
  (timestamptz '2031-04-01 15:00:00+00', :'mgr', 'manager', 'Test manager', 'user_region_changed',
   'user', :'mgr', 'Test manager', false, 'a64-7');

set local session_replication_role = origin;

-- Every read below runs as the admin, not as the test connection's owner. The functions start with
-- private.is_admin(), which asks auth.uid(), and pgTAP's own session carries no JWT — as postgres
-- this file would raise `not_allowed` twenty-nine times and call that a filter test. The owner is
-- needed back only to write (audit_log grants authenticated select and nothing else), so the role
-- flips around each seeding block.
select tests.as_authenticated(:'adm');

select is((select count(*)::int from public.audit_log where source_key like 'a64-%'), 7,
  'seven entries seeded, spanning every shape the filters have to tell apart');

-- ---- p_person: actor or subject, and it does not matter which ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'emp')), 'a64-1,a64-2,a64-6',
  'p_person finds the entries about a person, whether they acted or were acted on');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'emp2')), 'a64-3,a64-4',
  'and finds the ones where they are only the subject, never the actor');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'mgr')), 'a64-3,a64-7',
  'a manager''s own decisions and their own record change, and nothing else');

-- ---- the four single-column filters ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_action => 'request_submitted')), 'a64-2,a64-6',
  'p_action matches the action column exactly');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_entity => 'leave_request')), 'a64-2,a64-3,a64-6',
  'p_entity groups the request entries whatever their action');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_role => 'manager')), 'a64-3,a64-7',
  'p_role reads actor_role, so it finds what a manager did');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_role => 'admin')), 'a64-1,a64-4',
  'and a64-1 answers to admin, not to the employee role its subject holds');
select is((select count(*)::int from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_role => 'employee')), 2,
  'the employee role matches the two entries an employee acted in, not the four about employees');

-- ---- p_demo: true, false, and the null that means both ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_demo => true)), 'a64-5,a64-6',
  'p_demo => true is demo entries only');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_demo => false)), 'a64-1,a64-2,a64-3,a64-4,a64-7',
  'p_demo => false is real entries only — the page''s default, which hides the demo data (D9)');
select is((select count(*)::int from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_demo => null)), 7,
  'and a null p_demo is both, which is the only reading that makes false mean something');

-- ---- the date range: one end inside, one end outside ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 12:00+00', p_to => '2031-04-02 00:00+00')),
  'a64-4,a64-5,a64-6,a64-7',
  'p_from is inclusive: an entry exactly on the boundary is in the range');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-01 12:00+00')),
  'a64-1,a64-2,a64-3',
  'p_to is exclusive: the same instant on the other end is not');

-- ---- filters combine with AND, and never with OR ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'emp', p_demo => false)), 'a64-1,a64-2',
  'person AND real narrows to the intersection, dropping the demo submission');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'emp', p_demo => false, p_action => 'user_role_changed')), 'a64-1',
  'a third filter narrows it again, to the one entry all three describe');
select is((select count(*)::int from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_role => 'admin', p_demo => true)), 0,
  'AND of two filters nothing satisfies is an empty page, not the union of the two');

-- ---- keyset paging: newest first, and the cursor is the pair, not the timestamp ----
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_limit => 3)), 'a64-5,a64-6,a64-7',
  'a page of three is the three newest entries');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_before_at => (select created_at from public.audit_log where source_key = 'a64-5'),
             p_before_id => (select id from public.audit_log where source_key = 'a64-5'),
             p_limit => 3)), 'a64-2,a64-3,a64-4',
  'the next page starts after the cursor and repeats nothing');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_before_at => (select created_at from public.audit_log where source_key = 'a64-2'),
             p_before_id => (select id from public.audit_log where source_key = 'a64-2'),
             p_limit => 3)), 'a64-1',
  'and the page after that holds the oldest entry, so three pages cover all seven exactly once');

-- Two entries share 15:00:00, which is where a timestamp-only cursor loses a row: the first page
-- takes the higher id, and the cursor at that row must still hand back the lower one.
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_limit => 1)), 'a64-7',
  'of two entries at the same instant the higher id pages first');
select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_before_at => (select created_at from public.audit_log where source_key = 'a64-7'),
             p_before_id => (select id from public.audit_log where source_key = 'a64-7'),
             p_limit => 1)), 'a64-6',
  'and the cursor past it lands on its twin rather than skipping it');

select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_before_at => timestamptz '2031-04-01 13:00:00+00', p_limit => 3)),
  'a64-5,a64-6,a64-7',
  'a cursor with no id is read as no cursor, so a half-filled URL gives the newest page');

-- ---- a person can stop existing; their entries and their name do not ----
-- The id is minted here with the triggers off and referenced by exactly one row, so this page has
-- nothing in it that this block did not write.
select tests.reset_role();
set local session_replication_role = replica;
select tests.create_user('employee', 'QLD') as ghost \gset
insert into public.audit_log
  (created_at, actor_id, actor_role, actor_name, action, entity, subject_id, subject_name,
   source_key)
values
  (timestamptz '2031-04-01 16:00:00+00', :'adm', 'admin', 'Admin One', 'user_role_changed',
   'user', :'ghost', 'Gone Employee', 'a64-8');
delete from public.profiles where id = :'ghost';
delete from auth.users where id = :'ghost';
set local session_replication_role = origin;
select tests.as_authenticated(:'adm');

select is((select string_agg(source_key, ',' order by source_key) from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'ghost')), 'a64-8',
  'US3-5: an entry about someone who has since been deleted is still found by their id');
select is((select subject_name from public.audit_search(
             p_from => '2031-04-01 00:00+00', p_to => '2031-04-02 00:00+00',
             p_person => :'ghost')), 'Gone Employee',
  'and it still carries the name they had, because the row snapshots it rather than joining to them');

-- ---- p_limit: a page size with a ceiling ----
-- An overflow test needs more matching rows than the ceiling, so these 105 live in their own month
-- and every read below is bounded to it. A page full of this fixture is the point: unbounded,
-- count(*) = 100 would be true of the stack alone and would say nothing at all about the cap.
select tests.reset_role();
set local session_replication_role = replica;
insert into public.audit_log
  (created_at, actor_name, action, entity, is_backfilled, source_key)
select timestamptz '2031-05-01 00:00:00+00' + (n || ' minutes')::interval,
       'Bulk One', 'request_submitted', 'leave_request', false, 'a64-c' || lpad(n::text, 3, '0')
from generate_series(1, 105) as n;
set local session_replication_role = origin;
select tests.as_authenticated(:'adm');

select is((select count(*)::int from public.audit_search(
             p_from => '2031-05-01 00:00+00', p_to => '2031-06-01 00:00+00',
             p_limit => 500)), 100,
  'p_limit is capped at 100, whatever the caller asks for');
select is((select count(*)::int from public.audit_search(
             p_from => '2031-05-01 00:00+00', p_to => '2031-06-01 00:00+00',
             p_limit => 20)), 20,
  'below the cap it is the page size the caller asked for');
select is((select count(*)::int from public.audit_search(
             p_from => '2031-05-01 00:00+00', p_to => '2031-06-01 00:00+00',
             p_limit => 500)
           where source_key like 'a64-c%'), 100,
  'and the 100 kept are the newest: the five oldest of the 105 bulk entries fall off the end');
select ok(not exists (select 1 from public.audit_search(
             p_from => '2031-05-01 00:00+00', p_to => '2031-06-01 00:00+00',
             p_limit => 500)
                      where source_key = 'a64-c005'),
  'the oldest bulk entry is the one that went missing, not a newer one');

select tests.reset_role();

select * from finish();
rollback;

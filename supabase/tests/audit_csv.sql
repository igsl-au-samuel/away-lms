-- Spec 002 slice 4, A065: the CSV the export builds (FR-025, FR-026).
--
-- The assertions are on the text, because the text is what a spreadsheet opens. A cell-by-cell
-- comparison against the row would only re-test the query; what can go wrong here is the rendering,
-- and the ways it can go wrong are quiet — an unquoted comma turns one entry into two columns and
-- shifts every value after it, so the file still looks like a file and reads like nonsense.
--
-- Each block is exported through its own slice of 2031-2033 rather than the whole log, for two
-- reasons. It keeps the line numbers predictable (split_part(csv, E'\n', 2) is the row under test,
-- not somebody else's), and it keeps a fixture row's crafted comment out of the assertions made
-- about a different row. The window does the isolation: nothing a seed or a live session writes is
-- dated later than today, so a 2032 window holds only what this file put in it.
--
-- The thin row is the one that would fail silently if a null cell were left in the array instead of
-- coalesced: array_agg and array_to_string both drop NULLs, so an entry with no subject and no
-- before value would export eleven fields under a twelve-field header. It is asserted by counting
-- the fields in the line, which is the only thing that can see the difference.
--
-- The last block costs more than the rest of the file: proving `p_limit` really is capped at 10,000
-- needs 10,001 matching rows, because below the cap a smaller limit and no limit at all look alike.
-- It is one insert-select and one export, and it sits at the end so the shared local stack is
-- crowded for as little time as possible.
begin;
select plan(30);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset

-- ---------------------------------------------------------------------------
-- W1 — one fully populated row, rendered in full.
-- W2 — two rows half a year apart, for the timezone.
-- W3 — the dangerous cells.
-- W4 — five rows, for paging the file.
-- ---------------------------------------------------------------------------
set local session_replication_role = replica;

insert into public.audit_log
  (created_at, actor_id, actor_role, actor_name, action, entity, entity_id, subject_id,
   subject_name, before, after, comment, is_demo, is_backfilled, source_key)
values
  -- W1: every column has something in it, and the after value has three fields to order.
  (timestamptz '2032-03-05 20:30:00+00', :'adm', 'admin', 'Ada Admin', 'user_role_changed',
   'user', null, :'emp', 'Test employee', '{"role":"employee"}',
   '{"role":"manager","is_active":true,"region_code":"QLD"}', 'Promoted', false, false, 'a65-1'),
  -- W1b: the thin row — no actor id, no role, no subject, no before/after, no comment.
  (timestamptz '2032-03-05 21:00:00+00', null, null, 'System', 'leave_type_default_changed',
   'leave_type', null, null, null, null, null, null, false, true, 'a65-2'),
  -- W2: the same wall time in June and in December, so a fixed offset cannot satisfy both.
  (timestamptz '2031-07-15 09:00:00+00', :'adm', 'admin', 'Ada Admin', 'user_region_changed',
   'user', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-3'),
  (timestamptz '2031-12-15 09:00:00+00', :'adm', 'admin', 'Ada Admin', 'user_region_changed',
   'user', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-4'),
  -- W3: six cells that a spreadsheet would execute, plus quoting hazards.
  (timestamptz '2032-05-01 01:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, '=1+1', false, false, 'a65-5'),
  (timestamptz '2032-05-01 02:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, '+45', false, false, 'a65-6'),
  (timestamptz '2032-05-01 03:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, '-3', false, false, 'a65-7'),
  (timestamptz '2032-05-01 04:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, '@SUM(A1)', false, false, 'a65-8'),
  (timestamptz '2032-05-01 05:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, chr(9) || 'indented',
   false, false, 'a65-9'),
  (timestamptz '2032-05-01 06:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, chr(13) || 'returned',
   false, false, 'a65-10'),
  (timestamptz '2032-05-01 07:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Said "no" loudly', null, null, 'He said "no"',
   false, false, 'a65-11'),
  -- W4: a comma inside a name, and four more rows so the file has to cut somewhere.
  (timestamptz '2032-07-01 01:00:00+00', :'emp', 'employee', 'Nightingale, Ada',
   'request_submitted', 'leave_request', null, :'emp', 'Test employee', null, null, null,
   false, false, 'a65-12'),
  (timestamptz '2032-07-01 02:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-13'),
  (timestamptz '2032-07-01 03:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-14'),
  (timestamptz '2032-07-01 04:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-15'),
  (timestamptz '2032-07-01 05:00:00+00', :'emp', 'employee', 'Test employee', 'request_submitted',
   'leave_request', null, :'emp', 'Test employee', null, null, null, false, false, 'a65-16');

select id from public.audit_log where source_key = 'a65-1' \gset full_
select id from public.audit_log where source_key = 'a65-2' \gset thin_

set local session_replication_role = origin;

-- Read as an admin, not as the test connection's owner. This is not a formality: both functions
-- begin with private.is_admin(), which asks auth.uid(), and the superuser session pgTAP runs in
-- carries no JWT at all. Left as postgres, every call in this file would raise `not_allowed` and
-- the file would be a very confident test of nothing.
select tests.as_authenticated(:'adm');

-- ---- the header ----
select is(
  (select split_part(csv, E'\n', 1) from public.audit_export_csv(
     p_from => timestamptz '2032-03-05 00:00:00+00', p_tz => 'UTC')),
  'time,actor,actor_role,action,entity,subject,before,after,comment,demo,backfilled,entry_id',
  'FR-025: the header names all twelve columns in the documented order');

-- ---- one fully populated row, cell by cell ----
select is((select row_count from public.audit_export_csv(
             p_from => timestamptz '2032-03-05 20:00:00+00',
             p_to => timestamptz '2032-03-05 20:45:00+00', p_tz => 'UTC')), 1,
  'the W1 window holds exactly the row about to be compared, so line 2 is it');

select is(
  (select split_part(csv, E'\n', 2) from public.audit_export_csv(
     p_from => timestamptz '2032-03-05 20:00:00+00',
     p_to => timestamptz '2032-03-05 20:45:00+00', p_tz => 'UTC')),
  '"2032-03-05 20:30:00","Ada Admin","admin","user_role_changed","user","Test employee",'
    || '"role: employee","is_active: true; region_code: QLD; role: manager","Promoted","false",'
    || '"false","' || :'full_id' || '"',
  'a full entry renders as twelve quoted cells, before and after as field: value pairs');

select is(
  (select array_length(string_to_array(split_part(csv, E'\n', 2), '","'), 1)
   from public.audit_export_csv(p_from => timestamptz '2032-03-05 20:00:00+00',
                                p_to => timestamptz '2032-03-05 20:45:00+00', p_tz => 'UTC')),
  12, 'and the line splits into twelve fields');

-- ---- the thin row ----
select is(
  (select split_part(csv, E'\n', 2) from public.audit_export_csv(
     p_from => timestamptz '2032-03-05 20:45:00+00',
     p_to => timestamptz '2032-03-05 23:00:00+00', p_tz => 'UTC')),
  '"2032-03-05 21:00:00","System","","leave_type_default_changed","leave_type","","","","","false",'
    || '"true","' || :'thin_id' || '"',
  'an entry with no actor id, role, subject, before, after or comment exports empty cells, not gaps');

select is(
  (select array_length(string_to_array(split_part(csv, E'\n', 2), '","'), 1)
   from public.audit_export_csv(p_from => timestamptz '2032-03-05 20:45:00+00',
                                p_to => timestamptz '2032-03-05 23:00:00+00', p_tz => 'UTC')),
  12, 'which is still twelve fields — a null is rendered as empty rather than skipped');

-- ---- times in the zone the caller asked for (FR-025, 001 FR-026) ----
select is(
  (select split_part(split_part(csv, E'\n', 2), '","', 1) from public.audit_export_csv(
     p_from => timestamptz '2031-07-01 00:00:00+00', p_to => timestamptz '2032-01-01 00:00:00+00',
     p_tz => 'Australia/Brisbane')), '"2031-12-15 19:00:00',
  'Brisbane reads the December entry at UTC+10, which has no daylight saving');
select is(
  (select split_part(split_part(csv, E'\n', 2), '","', 1) from public.audit_export_csv(
     p_from => timestamptz '2031-07-01 00:00:00+00', p_to => timestamptz '2032-01-01 00:00:00+00',
     p_tz => 'America/Los_Angeles')), '"2031-12-15 01:00:00',
  'Los Angeles reads the same instant eight hours behind in December');
select is(
  (select split_part(split_part(csv, E'\n', 3), '","', 1) from public.audit_export_csv(
     p_from => timestamptz '2031-07-01 00:00:00+00', p_to => timestamptz '2032-01-01 00:00:00+00',
     p_tz => 'America/Los_Angeles')), '"2031-07-15 02:00:00',
  'and seven behind in July: the offset follows the date, it is not one number applied to the file');
select is(
  (select split_part(split_part(csv, E'\n', 3), '","', 1) from public.audit_export_csv(
     p_from => timestamptz '2031-07-01 00:00:00+00', p_to => timestamptz '2032-01-01 00:00:00+00',
     p_tz => 'Asia/Kolkata')), '"2031-07-15 14:30:00',
  'a half-hour zone renders to the minute rather than being rounded');

-- ---- FR-026: values a spreadsheet would run come out as text ----
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"''=1+1"%', 'a comment starting = is prefixed with a quote mark');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"''+45"%', 'the same for +');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"''-3"%', 'the same for -');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"''@SUM(A1)"%', 'the same for @');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like ('%"' || chr(39) || chr(9) || 'indented"%'), 'the same for a leading tab');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 00:00:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like ('%"' || chr(39) || chr(13) || 'returned"%'),
  'the same for a carriage return, which stays inside its quoted cell and does not break the line');

-- ---- quoting ----
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 06:30:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"He said ""no"""%', 'a double quote inside a cell is doubled');
select ok((select csv from public.audit_export_csv(
             p_from => timestamptz '2032-05-01 06:30:00+00',
             p_to => timestamptz '2032-05-02 00:00:00+00', p_tz => 'UTC'))
           like '%"Said ""no"" loudly"%', 'in the subject name as well as in the comment');
select is(
  (select array_length(string_to_array(split_part(csv, E'\n', 2), '","'), 1)
   from public.audit_export_csv(p_from => timestamptz '2032-07-01 00:00:00+00',
                                p_to => timestamptz '2032-07-01 01:30:00+00', p_tz => 'UTC')),
  12, 'a comma inside a name is quoted, so the row still has twelve fields and not thirteen');

-- ---- the file is the filtered page (FR-025) ----
select is(
  (select string_agg(rtrim(split_part(line, '","', 12), '"'), ','
                     order by rtrim(split_part(line, '","', 12), '"')::bigint)
   from unnest(string_to_array((select csv from public.audit_export_csv(
                                  p_from => timestamptz '2032-07-01 00:00:00+00',
                                  p_to => timestamptz '2032-07-02 00:00:00+00',
                                  p_tz => 'UTC')), E'\n')) as f(line)
   where line <> 'time,actor,actor_role,action,entity,subject,before,after,comment,demo,backfilled,entry_id'),
  (select string_agg(id::text, ',' order by id) from public.audit_search(
     p_from => timestamptz '2032-07-01 00:00:00+00',
     p_to => timestamptz '2032-07-02 00:00:00+00')),
  'FR-025: for the same filters the file holds exactly the entries audit_search returns');

select is((select row_count from public.audit_export_csv(
             p_from => timestamptz '2032-07-01 00:00:00+00',
             p_to => timestamptz '2032-07-02 00:00:00+00', p_tz => 'UTC')),
  (select count(*)::int from public.audit_search(
     p_from => timestamptz '2032-07-01 00:00:00+00',
     p_to => timestamptz '2032-07-02 00:00:00+00')),
  'and row_count is the number of data lines in it');

-- ---- p_limit: the newest rows win ----
select is((select truncated from public.audit_export_csv(
             p_from => timestamptz '2032-07-01 00:00:00+00',
             p_to => timestamptz '2032-07-02 00:00:00+00', p_tz => 'UTC', p_limit => 2)), true,
  'more matching rows than p_limit is reported as a truncated file');
select is((select row_count from public.audit_export_csv(
             p_from => timestamptz '2032-07-01 00:00:00+00',
             p_to => timestamptz '2032-07-02 00:00:00+00', p_tz => 'UTC', p_limit => 2)), 2,
  'the file carries p_limit rows, not one more');
select is(
  (select string_agg(rtrim(split_part(line, '","', 12), '"'), ','
                     order by rtrim(split_part(line, '","', 12), '"')::bigint desc)
   from unnest(string_to_array((select csv from public.audit_export_csv(
                                  p_from => timestamptz '2032-07-01 00:00:00+00',
                                  p_to => timestamptz '2032-07-02 00:00:00+00',
                                  p_tz => 'UTC', p_limit => 2)), E'\n')) as f(line)
   where line <> 'time,actor,actor_role,action,entity,subject,before,after,comment,demo,backfilled,entry_id'),
  (select string_agg(id::text, ',' order by id desc) from public.audit_search(
     p_from => timestamptz '2032-07-01 00:00:00+00',
     p_to => timestamptz '2032-07-02 00:00:00+00', p_limit => 2)),
  'and they are the newest two, the same two the first page of the screen shows');

-- ---- a bad p_tz is refused, not guessed ----
select throws_ok('select csv from public.audit_export_csv(p_tz => ''AEST'')',
  'P0001', 'invalid_timezone',
  'an abbreviation is not an IANA name, so it raises rather than quietly picking an offset');
select throws_ok('select csv from public.audit_export_csv(p_tz => ''Mars/Olympus'')',
  'P0001', 'invalid_timezone', 'a name that does not exist at all raises the same way');
select throws_ok('select csv from public.audit_export_csv()',
  'P0001', 'invalid_timezone',
  'and so does leaving p_tz out, which the signature allows but the file cannot survive');

-- ---------------------------------------------------------------------------
-- W5 — the cap. Above p_limit = 10,000 a capped export and an uncapped one are the same answer
-- unless more than 10,000 rows match, so this is the one block that has to be big.
-- Seeding needs the owner back: audit_log grants authenticated select and nothing else (FR-006).
-- ---------------------------------------------------------------------------
select tests.reset_role();

insert into public.audit_log
  (created_at, actor_name, action, entity, source_key)
select timestamptz '2033-01-01 00:00:00+00' + (n || ' minutes')::interval,
       'Bulk One', 'request_submitted', 'leave_request', 'a65-k' || lpad(n::text, 5, '0')
from generate_series(1, 10001) as n;

select tests.as_authenticated(:'adm');

select is((select row_count from public.audit_export_csv(
             p_from => timestamptz '2033-01-01 00:00:00+00', p_tz => 'UTC', p_limit => 99999)),
  10000, 'a p_limit above 10,000 is capped at 10,000, not honoured');
select is((select truncated from public.audit_export_csv(
             p_from => timestamptz '2033-01-01 00:00:00+00', p_tz => 'UTC', p_limit => 99999)),
  true, 'and the caller is told, which is what the X-Audit-Truncated header carries');
select is((select row_count from public.audit_export_csv(
             p_from => timestamptz '2033-01-01 00:00:00+00', p_tz => 'UTC')),
  10000, 'the default limit needs no argument to reach the same ceiling');

select tests.reset_role();

select * from finish();
rollback;

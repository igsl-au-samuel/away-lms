-- FR-010, ADR 0004 and D6/D8: demo rows are marked, stay marked after the demo
-- account is removed, and a demo employee gets exactly the employee view — never a
-- real colleague's entries. The marking comes from the subject, so the secret-key
-- route that creates demo people records System and still marks the entry.
begin;
select plan(10);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', true, true) as dmo \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A25 annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'dmo', :'lt', 2026::smallint, 25, 'Demo figure');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 25, 'Real figure');
select tests.reset_role();

select tests.as_authenticated(:'dmo');
select public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08');
select tests.reset_role();

-- A default change: subject null, so the flag falls back to the caller, who is not demo.
update public.leave_types set default_allowance = 22.0 where id = :'lt';

select is(
  (select is_demo::text from public.audit_log
   where action = 'allowance_set' and subject_id = :'dmo'),
  'true',
  'an entry about a demo subject is marked demo');
select is(
  (select actor_name || '/' || is_demo::text from public.audit_log
   where action = 'user_created' and subject_id = :'dmo'),
  'System/true',
  'the demo loader route records System and still marks the entry (D6)');
select is(
  (select is_demo::text from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  'false',
  'an entry about a real subject is not marked');
select is(
  (select is_demo::text from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'lt'),
  'false',
  'with no subject the flag comes from the caller');

select tests.as_authenticated(:'dmo');
select is(
  (select count(*)::int from public.audit_log where subject_id = :'dmo'),
  3,
  'the demo employee sees their own three entries');
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp'),
  0,
  'the demo employee never sees a real colleague''s entries (D8)');
select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed'),
  1,
  'the demo employee sees the default change, as every employee does');
select tests.reset_role();

select tests.as_authenticated(:'emp');
select is(
  (select count(*)::int from public.audit_log where subject_id = :'dmo'),
  0,
  'a real employee sees nothing about the demo colleague either');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is(
  (select count(*)::int from public.audit_log where subject_id = :'dmo'),
  3,
  'the admin can read demo entries: the Audit page filters them, the policy does not');
select tests.reset_role();

-- Demo remove cascades the profile and the override.
delete from auth.users where id = :'dmo';
select is(
  (select count(*)::int from public.audit_log where subject_id = :'dmo'),
  3,
  'removing the demo user leaves their entries, still marked demo');

select * from finish();
rollback;

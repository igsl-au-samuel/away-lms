-- Research R12 / FR-008a and R8: a leave type's default_allowance change is an audited event.
-- The old half of this file read public.allowance_changes, which private.log_leave_type_default()
-- (20261017052559) fills from the same trigger; slice 2 gives the history one home, so these
-- assertions now read audit_log, where slice 1's leave_types trigger already writes.
--
-- R8's improvement is visible at the end: with no caller — a migration, or a direct owner
-- session — the old trigger returned without logging anything, while the audit trigger records
-- System. The one assertion that really splits on A039 is the last: it takes the either/or form
-- below, because before A039 the old trigger is still attached and after it is not, and the plan
-- count stays 13 either way. Guard convention: decision 7 of
-- specs/002-transaction-audit/tasks.md, added by #371. A039 deletes the branch and shows the
-- post-A039 wording failing against main first.
--
-- This file stays next to audit_events_leave_types.sql, which owns the same two events from the
-- trigger's side (FR-031). This one is the FR-008a behaviour story; who may read the entries is
-- access-matrix rows 33 and 34.
begin;

select to_regprocedure('private.log_leave_type_default()') is null as old_trigger_gone \gset

-- One assertion either way, so the plan count does not move with the guard.
select plan(13);

select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A36 Study', true, 5) returning id as study \gset

select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  0,
  'creating a leave type is not a change: no entry'
);

-- The change itself, made as the signed-in admin.
select tests.as_authenticated(:'adm');
update public.leave_types set default_allowance = 7 where id = :'study';
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  1,
  'a default change writes one entry'
);
select is(
  (select action || '/' || (subject_id is null)::text || '/' || entity || '/'
        || (entity_id = :'study')::text
   from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  'leave_type_default_changed/true/leave_type/true',
  'the entry is about the type, and a default belongs to everybody so it has no subject'
);
select is(
  (select (before->>'default_allowance') || '>' || (after->>'default_allowance')
        || ' capped=' || (before ? 'is_capped')::text || (after ? 'is_capped')::text
   from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  '5.0>7.0 capped=truetrue',
  'old and new default, and the is_capped half the pair carries even when it did not move'
);
select is(
  (select actor_id = :'adm' and actor_role::text = 'admin' and actor_name = 'Test admin'
   from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  true,
  'the admin is the actor, with the role and name they hold now'
);
select ok(
  (select created_at is not null from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  'the entry is timed'
);

-- Renaming, re-sorting and retiring are a different event, not a default change.
select tests.as_authenticated(:'adm');
update public.leave_types set name = 'A36 study leave' where id = :'study';
update public.leave_types set sort_order = 9 where id = :'study';
update public.leave_types set is_active = false where id = :'study';
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  1,
  'none of the three writes a default entry'
);
select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_changed' and entity_id = :'study'),
  3,
  'and each writes its own leave_type_changed entry'
);
select is(
  (select (before->>'name') || '>' || (after->>'name') from public.audit_log
   where action = 'leave_type_changed' and entity_id = :'study'
     and before ? 'name'),
  'A36 Study>A36 study leave',
  'the rename entry carries only the field that moved, old and new'
);

-- Capping and uncapping are default changes: they move default_allowance with is_capped.
select tests.as_authenticated(:'adm');
update public.leave_types set is_capped = false, default_allowance = null where id = :'study';
update public.leave_types set is_capped = true, default_allowance = 3 where id = :'study';
select tests.reset_role();

select is(
  (select array_agg(coalesce(after->>'default_allowance', '<null>') order by id)
   from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  array['7.0', '<null>', '3.0'],
  'each new default in order, the uncap written as an explicit null and not as a missing key'
);

select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'),
  3,
  'uncapping and capping again each write one entry'
);

-- R8: the case the old trigger dropped on the floor. An owner session has no caller, so
-- private.log_leave_type_default() returned before inserting anything, while the audit
-- trigger records System and carries on. Who may read these entries is row33 and row34
-- of the access matrix, not this file.
update public.leave_types set default_allowance = 4 where id = :'study';

select is(
  (select actor_name || '/' || coalesce(actor_id::text, '<null>')
        || '/' || coalesce(actor_role::text, '<null>')
   from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'study'
   order by id desc limit 1),
  'System/<null>/<null>',
  'a change with no caller records System instead of going unlogged'
);

\if :old_trigger_gone
select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study'),
  0,
  'A039 dropped the old trigger, so a default change no longer reaches allowance_changes at all'
);
\else
-- Three, not four: the old trigger fired on all four default moves but returned without
-- inserting on the owner-session one, which is exactly the hole R8 closes.
select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study'),
  3,
  'while the old trigger is still attached it logs the admin''s three and drops the caller-less one'
);
\endif

select * from finish();
rollback;

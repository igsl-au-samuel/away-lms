-- Access matrix row 22: admin_set_allowance. Admin only; capped types only; each change
-- writes one audit entry (FR-004, FR-031). The log half of the old assertions moved from
-- allowance_changes to audit_log, where slice 1's allowance trigger already puts it.
--
-- The reason text reaches an entry through away.audit_reason, which admin_set_allowance has
-- set since migration A4 (A039). The three assertions that depend on it were guarded until
-- that landed; A039 deleted the guard, and they run here every time.
begin;

select plan(17);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row22 annual', true, 20) returning id as capped \gset
insert into public.leave_types (name, is_capped, default_allowance)
values ('Row22 unpaid', false, null) returning id as uncapped \gset

select tests.as_authenticated(:'adm');

select is(
  (select days from public.admin_set_allowance(:'emp', :'capped', 2026::smallint, 25, 'Long service')),
  25.0::numeric,
  'admin sets an override'
);
select is(
  (select days from public.allowance_overrides where user_id = :'emp' and leave_type_id = :'capped' and year = 2026),
  25.0::numeric,
  'the override is stored'
);

-- The entry the trigger wrote for that call. audit_events_allowances.sql covers the entry
-- shape in depth; what belongs here is that the RPC reaches it.
select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  1,
  'setting an override writes one audit entry'
);
select is(
  (select 'before=' || (before->>'days') || ' after=' || (after->>'days')
        || ' actor=' || (actor_id = :'adm')::text || ' default=' || (context->>'default_days')
   from public.audit_log where action = 'allowance_set' and subject_id = :'emp'),
  'before=20.0 after=25.0 actor=true default=20.0',
  'the entry has the old value (the type default), the new value, the caller and the default'
);

select tests.as_authenticated(:'adm');
select lives_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, null, %L)', :'emp', :'capped', 'Reset'),
  'admin removes the override'
);
select is(
  (select count(*)::int from public.allowance_overrides where user_id = :'emp' and leave_type_id = :'capped'),
  0,
  'the override is gone'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log
   where action in ('allowance_set', 'allowance_removed') and subject_id = :'emp'),
  2,
  'removing an override writes one more entry'
);
select is(
  (select action || ' days-key=' || (after ? 'days')::text
        || '/' || coalesce(after->>'days', '<null>') || ' old=' || (before->>'days')
   from public.audit_log where action = 'allowance_removed' and subject_id = :'emp'),
  'allowance_removed days-key=true/<null> old=25.0',
  'the removal entry keeps the days key with a null value and the old days'
);

-- Refused calls must leave nothing behind. Counted from here, so the number of entries the
-- calls above wrote is whatever the assertions above already pinned, not a constant.
select count(*)::int as entries0 from public.audit_log where subject_id = :'emp' \gset

select tests.as_authenticated(:'adm');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 5)', :'emp', :'uncapped'),
  'P0001', 'type_uncapped', 'an uncapped type raises type_uncapped'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'employee refused'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'manager refused'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  'P0001', 'not_allowed', 'inactive admin refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.admin_set_allowance(%L, %L, 2026::smallint, 30)', :'emp', :'capped'),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp') - :entries0,
  0,
  'refused calls wrote no entries'
);

-- The reason argument reaching the entry, R2's transaction-local setting, and
-- allowance_changes no longer being written at all.
-- Two fresh values, so neither row can be confused with the 25.0 entry written above.
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'capped', 2026::smallint, 40, 'Long service');
select public.admin_set_allowance(:'emp', :'capped', 2026::smallint, 45, '');
select tests.reset_role();

select is(
  (select comment from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp' and (after->>'days') = '40.0'),
  'Long service',
  'FR-031: the reason argument becomes the entry comment'
);
select is(
  (select comment from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp' and (after->>'days') = '45.0'),
  null,
  'R2: an empty reason after a non-empty one in the same transaction does not inherit it'
);
select is(
  (select count(*)::int from public.allowance_changes where user_id = :'emp'),
  0,
  'A039: admin_set_allowance writes no allowance_changes row at all'
);

select * from finish();
rollback;

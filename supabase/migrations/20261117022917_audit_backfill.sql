-- Spec 002 migration A3 (A038): carry the history that already exists into audit_log, so the
-- log starts at the beginning of the system rather than at the day slice 1 deployed.
-- Research R7, SC-006. Tested by supabase/tests/audit_backfill.sql (A034).
--
-- Two source tables. leave_requests was never logged anywhere at all, and allowance_changes is
-- the legacy log for two audited things: an override's value (allowance_overrides) and a
-- leave-type default (leave_types, written by the trigger A039 drops). profiles has nothing to
-- carry over — a role, region or active change was written down nowhere before slice 1, so
-- there is no row to read, and inventing one is the false history FR-005 forbids.
--
-- Why this is not private.audit_write(): audit_actor() reads auth.uid(), and a migration runs
-- as the table owner with no JWT behind it, so every entry would land as System and the real
-- requester, decider and changer would be lost. The inserts are therefore direct, and each one
-- repeats the shape its live trigger writes — same action, same before/after keys, same context
-- keys, actor and subject read from the profile as it stands now — so a carried-over entry and
-- a live one differ in nothing but is_backfilled.
--
-- The cutoff (decision 3): slices 1 and 2 deploy separately, and between them the live triggers
-- already wrote entries for whatever happened in that window. Backfilling those rows a second
-- time would double the log, so anything at or after the earliest live entry is left to the
-- triggers. The gate is per entry time, not per source row: a request submitted before the
-- cutoff and decided after it gets its submitted half and not its decision.
--
-- Idempotent by source_key, so a re-run — including one after a partial failure, this whole
-- migration being one transaction — adds nothing. The conflict target repeats the partial
-- index's predicate verbatim: on conflict (source_key) alone is not inferable from a partial
-- unique index and fails with 42P10.

create function private.audit_backfill()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Null on a database where no trigger has written yet, which is the fresh-install case where
  -- the whole history is in date.
  v_cutoff timestamptz;
begin
  select min(created_at) into v_cutoff from public.audit_log where not is_backfilled;

  -- request_submitted: one per request, pending ones included, dated when it was asked for.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    r.created_at,
    u.id, u.role, u.full_name,
    'request_submitted', 'leave_request', r.id, r.user_id, u.full_name,
    null,
    jsonb_build_object('status', r.status),
    jsonb_build_object(
      'leave_type_id', r.leave_type_id,
      'leave_type_name', lt.name,
      'year', extract(year from r.start_date)::int,
      'start_date', r.start_date,
      'end_date', r.end_date,
      'working_days', r.working_days
    ),
    null,
    u.is_demo,
    true,
    'req:' || r.id || ':submitted'
  from public.leave_requests r
  join public.profiles u on u.id = r.user_id
  join public.leave_types lt on lt.id = r.leave_type_id
  where v_cutoff is null or r.created_at < v_cutoff
  on conflict (source_key) where source_key is not null do nothing;

  -- The decision. leave_requests' own check constraint ties status = 'pending' to a null
  -- decider, so anything not pending has both decided_by and decided_at. The actor is the
  -- person who decided; the subject stays the requester.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    r.decided_at,
    d.id, d.role, d.full_name,
    case r.status when 'approved' then 'request_approved' else 'request_declined' end,
    'leave_request', r.id, r.user_id, u.full_name,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', r.status),
    jsonb_build_object(
      'leave_type_id', r.leave_type_id,
      'leave_type_name', lt.name,
      'year', extract(year from r.start_date)::int,
      'start_date', r.start_date,
      'end_date', r.end_date,
      'working_days', r.working_days
    ),
    r.decision_comment,
    u.is_demo,
    true,
    'req:' || r.id || ':decided'
  from public.leave_requests r
  join public.profiles u on u.id = r.user_id
  join public.profiles d on d.id = r.decided_by
  join public.leave_types lt on lt.id = r.leave_type_id
  where r.status <> 'pending'
    and (v_cutoff is null or r.decided_at < v_cutoff)
  on conflict (source_key) where source_key is not null do nothing;

  -- An override, or its removal. allowance_changes.new_days is null exactly when the override
  -- was taken away, which is the same thing that splits these two actions (decision 8).
  -- before.days is the stored old_days rather than the type default the live trigger looks up,
  -- because the row records what was in force at the time and the default may have moved since.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    ac.changed_at,
    a.id, a.role, a.full_name,
    case when ac.new_days is null then 'allowance_removed' else 'allowance_set' end,
    'allowance', null, ac.user_id, u.full_name,
    jsonb_build_object('days', ac.old_days),
    jsonb_build_object('days', ac.new_days),
    jsonb_build_object(
      'leave_type_id', ac.leave_type_id,
      'leave_type_name', lt.name,
      'year', ac.year,
      'default_days', lt.default_allowance
    ),
    ac.reason,
    u.is_demo,
    true,
    'ac:' || ac.id
  from public.allowance_changes ac
  join public.profiles a on a.id = ac.changed_by
  join public.profiles u on u.id = ac.user_id
  join public.leave_types lt on lt.id = ac.leave_type_id
  where ac.user_id is not null
    and (v_cutoff is null or ac.changed_at < v_cutoff)
  on conflict (source_key) where source_key is not null do nothing;

  -- A leave-type default: the same table's rows with user_id null, which is how the old log
  -- spelled "everyone". The live trigger writes is_capped beside default_allowance because
  -- leave_types constrains the pair (is_capped = default_allowance is not null), and a source
  -- row carries only the days, so the flag is derived from null-ness rather than dropped.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    ac.changed_at,
    a.id, a.role, a.full_name,
    'leave_type_default_changed', 'leave_type', ac.leave_type_id, null, null,
    jsonb_build_object(
      'default_allowance', ac.old_days, 'is_capped', ac.old_days is not null),
    jsonb_build_object(
      'default_allowance', ac.new_days, 'is_capped', ac.new_days is not null),
    jsonb_build_object('leave_type_id', ac.leave_type_id, 'leave_type_name', lt.name),
    ac.reason,
    -- No subject, so the actor's flag decides, exactly as private.audit_write() does.
    a.is_demo,
    true,
    'ac:' || ac.id
  from public.allowance_changes ac
  join public.profiles a on a.id = ac.changed_by
  join public.leave_types lt on lt.id = ac.leave_type_id
  where ac.user_id is null
    and (v_cutoff is null or ac.changed_at < v_cutoff)
  on conflict (source_key) where source_key is not null do nothing;
end;
$$;

-- Conventions: no API role calls this, and neither does the app. It stays defined afterwards so
-- a deploy that failed part-way can be finished from SQL, and so A045's production check can be
-- read back against the rows it wrote.
revoke all on function private.audit_backfill() from public, anon, authenticated, service_role;

-- The carry-over itself.
select private.audit_backfill();

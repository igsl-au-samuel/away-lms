-- Spec 002 migration A2 part 1 (A010): how an entry learns who made it, and the only
-- insert into audit_log. The four table triggers that call this land in A026–A029, which
-- complete this file's feature.
--
-- R1: the actor comes from auth.uid(), which reads the request's JWT claims rather than
-- the database role, so it survives security definer RPCs and triggers. Every user-facing
-- route carries the caller's JWT; the secret key, Studio, migrations and psql carry none
-- and therefore record as System.

create function private.audit_actor(
  out p_id uuid,
  out p_role public.app_role,
  out p_name text
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    p_id := null;
    p_role := null;
    p_name := 'System';
    return;
  end if;

  -- The role held now, read from the table rather than a JWT claim (ADR 0007).
  select uid, p.role, p.full_name into p_id, p_role, p_name
  from public.profiles p
  where p.id = uid;

  if not found then
    -- A signed-in uid with no profile: the id is still the truth, the label is not.
    p_id := uid;
    p_role := null;
    p_name := 'Unknown user';
  end if;
end;
$$;

-- R5 step 3: nothing outside a private trigger function may write an entry, so the MCP
-- server, the app and direct SQL all land in the same code path or not at all.
create function private.audit_write(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_subject_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_context jsonb default null,
  p_comment text default null,
  p_created_at timestamptz default null,
  p_source_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role public.app_role;
  v_actor_name text;
  v_subject_name text;
  v_is_demo boolean;
begin
  select p_id, p_role, p_name into v_actor_id, v_actor_role, v_actor_name
  from private.audit_actor();

  if p_subject_id is not null then
    select p.full_name, p.is_demo into v_subject_name, v_is_demo
    from public.profiles p
    where p.id = p_subject_id;
  end if;

  -- R4: is_demo is copied at write time and never recomputed, so a demo reset that
  -- deletes the person does not silently unmark their entries. An entry with no subject
  -- falls back to the actor's flag.
  if p_subject_id is null then
    select p.is_demo into v_is_demo
    from public.profiles p
    where p.id = v_actor_id;
  end if;

  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, source_key
  ) values (
    coalesce(p_created_at, now()),
    v_actor_id, v_actor_role, v_actor_name,
    p_action, p_entity, p_entity_id, p_subject_id, v_subject_name,
    p_before, p_after, p_context, p_comment, coalesce(v_is_demo, false), p_source_key
  );
end;
$$;

-- Conventions: every private function is revoked from the API roles by name (ADR 0009).
-- can_view_audit is the one exception, made in the audit_log migration.
revoke all on function private.audit_actor() from public, anon, authenticated, service_role;
revoke all on function
  private.audit_write(text, text, uuid, uuid, jsonb, jsonb, jsonb, text, timestamptz, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A026-A029: which trigger writes which event (research R3). AFTER ROW triggers on the
-- four business tables, each with a `when` clause so a no-op save writes nothing. before
-- and after are built from an explicit field list per table, never to_jsonb(row): the
-- row form would leak profiles.email and every column added later (FR-007).
-- ---------------------------------------------------------------------------

-- leave_requests: one entry on submit, one when a pending request is decided. Requests are
-- never audited on any other update, so a cascade delete stays silent (R3).
create function private.audit_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type_name text;
begin
  select name into v_type_name from public.leave_types where id = new.leave_type_id;

  if tg_op = 'INSERT' then
    perform private.audit_write(
      'request_submitted', 'leave_request', new.id, new.user_id,
      null,
      jsonb_build_object('status', new.status),
      jsonb_build_object(
        'leave_type_id', new.leave_type_id,
        'leave_type_name', v_type_name,
        'year', extract(year from new.start_date)::int,
        'start_date', new.start_date,
        'end_date', new.end_date,
        'working_days', new.working_days
      ),
      null,
      new.created_at
    );
    return null;
  end if;

  -- request_approved or request_declined: the WHEN clause already excludes anything that
  -- was not pending, and request_status has exactly three values.
  perform private.audit_write(
    case new.status when 'approved' then 'request_approved' else 'request_declined' end,
    'leave_request', new.id, new.user_id,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status),
    jsonb_build_object(
      'leave_type_id', new.leave_type_id,
      'leave_type_name', v_type_name,
      'year', extract(year from new.start_date)::int,
      'start_date', new.start_date,
      'end_date', new.end_date,
      'working_days', new.working_days
    ),
    new.decision_comment,
    new.decided_at
  );
  return null;
end;
$$;

create trigger audit_insert
  after insert on public.leave_requests
  for each row execute function private.audit_requests();

create trigger audit_decision
  after update of status on public.leave_requests
  for each row
  when (old.status = 'pending' and new.status is distinct from old.status)
  execute function private.audit_requests();

-- allowance_overrides: the old value is the prior override, or the type default when there
-- was none, which is what the retired allowance_changes log recorded.
create function private.audit_allowances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type_name text;
  v_default numeric(5,1);
  v_old_days numeric(5,1);
begin
  if tg_op = 'DELETE' then
    -- R3: removing a demo user cascades to their overrides. In an AFTER ROW trigger fired
    -- by a cascade the parent profile is already gone, and a cascade is not an event.
    if not exists (select 1 from public.profiles where id = old.user_id) then
      return null;
    end if;
  end if;

  select name, default_allowance into v_type_name, v_default
  from public.leave_types
  where id = coalesce(new.leave_type_id, old.leave_type_id);

  if tg_op = 'INSERT' then
    v_old_days := v_default;
  elsif tg_op = 'UPDATE' then
    v_old_days := old.days;
  end if;

  if tg_op = 'DELETE' then
    perform private.audit_write(
      'allowance_removed', 'allowance', null, old.user_id,
      jsonb_build_object('days', old.days),
      jsonb_build_object('days', null),
      jsonb_build_object(
        'leave_type_id', old.leave_type_id,
        'leave_type_name', v_type_name,
        'year', old.year,
        'default_days', v_default
      ),
      nullif(current_setting('away.audit_reason', true), '')
    );
    return null;
  end if;

  perform private.audit_write(
    'allowance_set', 'allowance', null, new.user_id,
    jsonb_build_object('days', v_old_days),
    jsonb_build_object('days', new.days),
    jsonb_build_object(
      'leave_type_id', new.leave_type_id,
      'leave_type_name', v_type_name,
      'year', new.year,
      'default_days', v_default
    ),
    nullif(current_setting('away.audit_reason', true), '')
  );
  return null;
end;
$$;

create trigger audit_change
  after insert or update of days or delete on public.allowance_overrides
  for each row execute function private.audit_allowances();

-- profiles: one entry per changed field, so each entry can carry exactly one visibility
-- rule. A save that changes role and region writes two entries (FR-014, R3).
create function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit_write(
      'user_created', 'user', new.id, new.id,
      null,
      jsonb_build_object('role', new.role, 'region_code', new.region_code, 'is_active', new.is_active),
      null, null, new.created_at
    );
    return null;
  end if;

  if new.role is distinct from old.role then
    perform private.audit_write('user_role_changed', 'user', new.id, new.id,
      jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;

  if new.region_code is distinct from old.region_code then
    perform private.audit_write('user_region_changed', 'user', new.id, new.id,
      jsonb_build_object('region_code', old.region_code),
      jsonb_build_object('region_code', new.region_code));
  end if;

  if new.is_active is distinct from old.is_active then
    perform private.audit_write('user_active_changed', 'user', new.id, new.id,
      jsonb_build_object('is_active', old.is_active),
      jsonb_build_object('is_active', new.is_active));
  end if;

  return null;
end;
$$;

create trigger audit_insert
  after insert on public.profiles
  for each row execute function private.audit_profiles();

create trigger audit_change
  after update of role, region_code, is_active on public.profiles
  for each row
  when (new.role is distinct from old.role
     or new.region_code is distinct from old.region_code
     or new.is_active is distinct from old.is_active)
  execute function private.audit_profiles();

-- leave_types: subject_id is null, because a default belongs to everybody and a rename
-- belongs to the admin only. That split is why these are two actions and not one.
create function private.audit_leave_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := jsonb_build_object(
    'leave_type_id', new.id, 'leave_type_name', new.name);
begin
  -- Both halves of the pair are written even when only one moved: the table constraint
  -- is_capped = (default_allowance is not null) means they change together, and an entry
  -- holding only one of them cannot be read back. default_allowance is legitimately null
  -- when a type is uncapped, so jsonb_strip_nulls is not usable here.
  if new.default_allowance is distinct from old.default_allowance
     or new.is_capped is distinct from old.is_capped then
    perform private.audit_write(
      'leave_type_default_changed', 'leave_type', new.id, null,
      jsonb_build_object('default_allowance', old.default_allowance, 'is_capped', old.is_capped),
      jsonb_build_object('default_allowance', new.default_allowance, 'is_capped', new.is_capped),
      v_context);
  end if;

  -- Changed fields only: none of these three can be null, so stripping nulls is safe.
  if new.name is distinct from old.name
     or new.is_active is distinct from old.is_active
     or new.sort_order is distinct from old.sort_order then
    perform private.audit_write(
      'leave_type_changed', 'leave_type', new.id, null,
      jsonb_strip_nulls(jsonb_build_object(
        'name', case when new.name is distinct from old.name then new.name end,
        'is_active', case when new.is_active is distinct from old.is_active then new.is_active end,
        'sort_order', case when new.sort_order is distinct from old.sort_order then new.sort_order end)),
      jsonb_strip_nulls(jsonb_build_object(
        'name', case when new.name is distinct from old.name then new.name end,
        'is_active', case when new.is_active is distinct from old.is_active then new.is_active end,
        'sort_order', case when new.sort_order is distinct from old.sort_order then new.sort_order end)),
      v_context);
  end if;

  return null;
end;
$$;

create trigger audit_change
  after update on public.leave_types
  for each row
  when (new.default_allowance is distinct from old.default_allowance
     or new.is_capped is distinct from old.is_capped
     or new.name is distinct from old.name
     or new.is_active is distinct from old.is_active
     or new.sort_order is distinct from old.sort_order)
  execute function private.audit_leave_types();

-- A030: the four trigger functions above are not callable from any API role either; they
-- exist only as trigger targets.
revoke all on function private.audit_requests() from public, anon, authenticated, service_role;
revoke all on function private.audit_allowances() from public, anon, authenticated, service_role;
revoke all on function private.audit_profiles() from public, anon, authenticated, service_role;
revoke all on function private.audit_leave_types() from public, anon, authenticated, service_role;

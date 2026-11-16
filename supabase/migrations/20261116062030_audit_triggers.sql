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

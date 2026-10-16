-- T047: admin people RPCs (contracts/database-api.md, access matrix row 4).
-- Errors are P0001 with the code as the message and plain English as the detail.

-- Called right after auth.admin.inviteUserByEmail succeeds.
create function public.admin_create_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_role public.app_role,
  p_region_code text,
  p_timezone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can add people.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'There is no sign-in account with that id.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'profile_exists',
      detail = 'This person already has a profile.';
  end if;

  insert into public.profiles (id, full_name, email, role, region_code, timezone)
  values (p_user_id, p_full_name, lower(p_email), p_role, p_region_code, p_timezone)
  returning * into result;
  return result;
end;
$$;

create function public.admin_update_user(
  p_user_id uuid,
  p_full_name text,
  p_role public.app_role,
  p_region_code text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can edit people.';
  end if;

  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'There is no profile with that id.';
  end if;
  if p_user_id = auth.uid() and p_role <> target.role then
    raise exception using errcode = 'P0001', message = 'cannot_change_own_role',
      detail = 'You can''t change your own role. Ask another admin.';
  end if;
  if target.is_demo and p_role <> 'employee' then
    raise exception using errcode = 'P0001', message = 'demo_must_be_employee',
      detail = 'Demo users are always employees.';
  end if;

  update public.profiles
  set full_name = p_full_name, role = p_role, region_code = p_region_code
  where id = p_user_id
  returning * into target;
  return target;
end;
$$;

-- The Server Action bans or unbans the auth user afterwards.
create function public.admin_set_active(p_user_id uuid, p_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can activate or deactivate people.';
  end if;
  if p_user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'cannot_deactivate_self',
      detail = 'You can''t deactivate yourself. Ask another admin.';
  end if;

  update public.profiles set is_active = p_active
  where id = p_user_id
  returning * into result;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'There is no profile with that id.';
  end if;
  return result;
end;
$$;

-- Supabase grants execute on new functions to anon explicitly, so revoke it by name.
revoke all on function
  public.admin_create_profile(uuid, text, text, public.app_role, text, text),
  public.admin_update_user(uuid, text, public.app_role, text),
  public.admin_set_active(uuid, boolean)
  from public, anon;
grant execute on function
  public.admin_create_profile(uuid, text, text, public.app_role, text, text),
  public.admin_update_user(uuid, text, public.app_role, text),
  public.admin_set_active(uuid, boolean)
  to authenticated;

-- T030: caller-resolution helpers in a non-exposed schema, plus whoami().
create schema private;
-- Not listed in the API's exposed schemas, so PostgREST cannot reach it. Usage is
-- granted so RLS policies evaluated as these roles can call the helpers.
grant usage on schema private to anon, authenticated;

-- The caller's role, or null when they have no profile or are inactive.
create function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() = 'admin', false);
$$;

-- Managers and admins can approve.
create function private.is_approver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() in ('manager', 'admin'), false);
$$;

revoke all on function private.current_role(), private.is_admin(), private.is_approver()
  from public;
grant execute on function private.current_role(), private.is_admin(), private.is_approver()
  to anon, authenticated;

-- The caller's profile, or null (anon, no profile, inactive).
create function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'role', p.role,
    'region_code', p.region_code,
    'timezone', p.timezone,
    'is_active', p.is_active,
    'is_demo', p.is_demo
  )
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

revoke all on function public.whoami() from public;
grant execute on function public.whoami() to anon, authenticated;

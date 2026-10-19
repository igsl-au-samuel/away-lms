-- T048: enable or disable every demo profile (access matrix row 5, FR-031).
-- Returns the affected ids so the Server Action can ban or unban each one.
create function public.admin_set_demo_active(p_active boolean)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can switch the demo on or off.';
  end if;

  with changed as (
    update public.profiles set is_active = p_active
    where is_demo
    returning id
  )
  select coalesce(array_agg(id order by id), '{}') into ids from changed;
  return ids;
end;
$$;

revoke all on function public.admin_set_demo_active(boolean) from public, anon;
grant execute on function public.admin_set_demo_active(boolean) to authenticated;

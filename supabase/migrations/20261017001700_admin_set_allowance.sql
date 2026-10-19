-- T083: set or remove a per-user allowance override and log it (access matrix row 22,
-- FR-008, FR-008a). One transaction: the override change and its log row.
create function public.admin_set_allowance(
  p_user_id uuid,
  p_leave_type_id uuid,
  p_year smallint,
  p_days numeric,
  p_reason text default null
)
returns public.allowance_overrides
language plpgsql
security definer
set search_path = ''
as $$
declare
  capped boolean;
  default_days numeric(5,1);
  old_days numeric(5,1);
  result public.allowance_overrides;
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can change allowances.';
  end if;

  select is_capped, default_allowance into capped, default_days
  from public.leave_types where id = p_leave_type_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if not capped then
    raise exception using errcode = 'P0001', message = 'type_uncapped',
      detail = 'Allowances apply to capped leave types only.';
  end if;

  select days into old_days from public.allowance_overrides
  where user_id = p_user_id and leave_type_id = p_leave_type_id and year = p_year;
  old_days := coalesce(old_days, default_days);

  if p_days is null then
    delete from public.allowance_overrides
    where user_id = p_user_id and leave_type_id = p_leave_type_id and year = p_year;
  else
    insert into public.allowance_overrides (user_id, leave_type_id, year, days)
    values (p_user_id, p_leave_type_id, p_year, p_days)
    on conflict (user_id, leave_type_id, year) do update set days = excluded.days
    returning * into result;
  end if;

  insert into public.allowance_changes
    (user_id, leave_type_id, year, old_days, new_days, changed_by, reason)
  values
    (p_user_id, p_leave_type_id, p_year, old_days, p_days, (select auth.uid()), p_reason);

  return result;
end;
$$;

revoke all on function public.admin_set_allowance(uuid, uuid, smallint, numeric, text)
  from public, anon;
grant execute on function public.admin_set_allowance(uuid, uuid, smallint, numeric, text)
  to authenticated;

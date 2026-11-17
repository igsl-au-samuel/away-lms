-- A039 (spec 002 slice 2, migration A4): an allowance change is recorded in audit_log and
-- nowhere else. The signature, the three error messages and the grants are unchanged, so the
-- routes and the e2e calls keep working.
--
-- `allowance_changes` stops being written but stays exactly as it is — table, policies,
-- grants, indexes — until migration B (A046) drops it, because A040-A043 still read it.
--
-- The reason travels as a transaction-local setting: private.audit_allowances() writes the
-- entry and reads it from away.audit_reason
-- (20261116062030_audit_triggers.sql:222,237), where nullif(…, '') turns an empty reason
-- into a null comment. That is R2's rule — an empty reason is no reason — and it is why this
-- function sets '' rather than skipping the call when p_reason is null: a stale value left by
-- an outer transaction would otherwise attach somebody else's reason to this change.
create or replace function public.admin_set_allowance(
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
  result public.allowance_overrides;
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only an active admin can change allowances.';
  end if;

  select is_capped into capped
  from public.leave_types where id = p_leave_type_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if not capped then
    raise exception using errcode = 'P0001', message = 'type_uncapped',
      detail = 'Allowances apply to capped leave types only.';
  end if;

  -- Set before the write, so the trigger that fires on it reads this reason and nobody else's.
  perform pg_catalog.set_config('away.audit_reason', coalesce(p_reason, ''), true);

  if p_days is null then
    delete from public.allowance_overrides
    where user_id = p_user_id and leave_type_id = p_leave_type_id and year = p_year;
  else
    insert into public.allowance_overrides (user_id, leave_type_id, year, days)
    values (p_user_id, p_leave_type_id, p_year, p_days)
    on conflict (user_id, leave_type_id, year) do update set days = excluded.days
    returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.admin_set_allowance(uuid, uuid, smallint, numeric, text)
  from public, anon;
grant execute on function public.admin_set_allowance(uuid, uuid, smallint, numeric, text)
  to authenticated;

-- The legacy leave-type default logger wrote an allowance_changes row with user_id null
-- ("everyone"). private.audit_leave_types() has recorded the same event since slice 1, and
-- records it better: the old function returned before inserting whenever there was no
-- signed-in caller (auth.uid() null), so a migration or a secret-key change left no trace at
-- all, while the audit trigger writes one with actor System.
drop trigger leave_types_log_default on public.leave_types;
drop function private.log_leave_type_default();

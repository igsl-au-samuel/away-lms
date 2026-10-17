-- T148: log leave-type default changes (research R12, FR-008a). One allowance_changes
-- row with user_id null ("everyone") when default_allowance changes, including
-- capping or uncapping. Renaming, re-sorting and retiring write nothing.
create function private.log_leave_type_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  -- changed_by is required. Migrations and the secret key have no caller, and the
  -- app only edits leave types as the signed-in admin, so those go unlogged.
  if caller is null then
    return null;
  end if;

  insert into public.allowance_changes (user_id, leave_type_id, year, old_days, new_days, changed_by)
  values (null, new.id, null, old.default_allowance, new.default_allowance, caller);
  return null;
end;
$$;

revoke all on function private.log_leave_type_default() from public, anon, authenticated;

create trigger leave_types_log_default
  after update of default_allowance on public.leave_types
  for each row
  when (old.default_allowance is distinct from new.default_allowance)
  execute function private.log_leave_type_default();

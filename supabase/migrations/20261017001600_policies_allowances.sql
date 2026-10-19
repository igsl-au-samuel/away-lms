-- T082: read-only policies for allowance_overrides and allowance_changes
-- (access matrix rows 21, 23, 24). Writes go through admin_set_allowance only.
create policy allowance_overrides_select on public.allowance_overrides
  for select to authenticated
  using (
    (select private.current_role()) is not null
    and (user_id = (select auth.uid()) or (select private.is_approver()))
  );

create policy allowance_changes_select on public.allowance_changes
  for select to authenticated
  using (
    (select private.current_role()) is not null
    and (user_id is null or user_id = (select auth.uid()) or (select private.is_approver()))
  );

-- Logged-out users read neither table.
revoke select on public.allowance_overrides, public.allowance_changes from anon;

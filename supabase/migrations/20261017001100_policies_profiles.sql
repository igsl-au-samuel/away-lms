-- T045: profiles RLS (access matrix rows 1-3). Active users read every profile;
-- each updates only their own region_code and timezone (column grant from T025).
-- No insert or delete: profiles come from the admin RPCs and go with auth.users.
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.current_role()) is not null);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select private.current_role()) is not null)
  with check (id = (select auth.uid()));

revoke insert, delete on public.profiles from authenticated;

-- The trigger runs as the caller, who can't execute assert_valid_timezone or
-- (when inactive) read regions. Run it as the owner instead.
alter function public.profiles_set_timezone() security definer;

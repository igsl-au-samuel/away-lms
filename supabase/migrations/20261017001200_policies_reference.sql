-- T046: reference-data RLS (access matrix rows 6-9). Active users read; admins
-- write. Nobody deletes a leave type (retire it with is_active) or a region.
create policy leave_types_select on public.leave_types
  for select to authenticated
  using ((select private.current_role()) is not null);
create policy leave_types_insert on public.leave_types
  for insert to authenticated
  with check ((select private.is_admin()));
create policy leave_types_update on public.leave_types
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy holiday_regions_select on public.holiday_regions
  for select to authenticated
  using ((select private.current_role()) is not null);
create policy holiday_regions_insert on public.holiday_regions
  for insert to authenticated
  with check ((select private.is_admin()));
create policy holiday_regions_update on public.holiday_regions
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy public_holidays_select on public.public_holidays
  for select to authenticated
  using ((select private.current_role()) is not null);
create policy public_holidays_insert on public.public_holidays
  for insert to authenticated
  with check ((select private.is_admin()));
create policy public_holidays_update on public.public_holidays
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy public_holidays_delete on public.public_holidays
  for delete to authenticated
  using ((select private.is_admin()));

revoke delete on public.leave_types, public.holiday_regions from authenticated;

-- The trigger runs as the caller, who can't execute assert_valid_timezone.
alter function public.holiday_regions_check_tz() security definer;

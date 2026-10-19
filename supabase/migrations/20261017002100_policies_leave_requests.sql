-- T104: read-only access to leave_requests (access matrix rows 10, 11). Own rows,
-- or all rows for a manager or admin. Writes go through the RPCs only.
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (
    (select private.current_role()) is not null
    and (user_id = (select auth.uid()) or (select private.is_approver()))
  );

revoke insert, update, delete on public.leave_requests from authenticated;

-- Logged-out users read nothing.
revoke select on public.leave_requests from anon;

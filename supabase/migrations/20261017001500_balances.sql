-- T081: balance arithmetic (access matrix row 20, FR-010, US1-3).
-- Runs as the owner: leave_requests has no read policy for the caller yet.
create function private.available_balance(p_user uuid, p_type uuid, p_year smallint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when lt.is_capped then
    coalesce(o.days, lt.default_allowance, 0) - coalesce(
      (select sum(r.working_days) from public.leave_requests r
       where r.user_id = p_user and r.leave_type_id = p_type
         and r.status in ('pending', 'approved')
         and extract(year from r.start_date) = p_year), 0)
  end
  from public.leave_types lt
  left join public.allowance_overrides o
    on o.user_id = p_user and o.leave_type_id = lt.id and o.year = p_year
  where lt.id = p_type;
$$;

revoke all on function private.available_balance(uuid, uuid, smallint) from public, anon;
grant execute on function private.available_balance(uuid, uuid, smallint) to authenticated;

create function public.get_balances(p_user_id uuid, p_year smallint)
returns table (
  leave_type_id uuid,
  name text,
  is_capped boolean,
  allowance numeric,
  taken numeric,
  pending numeric,
  available numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    (select auth.uid()) = p_user_id and private.current_role() is not null
    or private.is_approver()
  ) then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'You can only read your own balances unless you are a manager or admin.';
  end if;

  return query
  select
    lt.id,
    lt.name,
    lt.is_capped,
    (case when lt.is_capped then coalesce(o.days, lt.default_allowance, 0) end)::numeric(5,1),
    coalesce(u.taken, 0)::numeric(5,1),
    coalesce(u.pending, 0)::numeric(5,1),
    private.available_balance(p_user_id, lt.id, p_year)::numeric(5,1)
  from public.leave_types lt
  left join public.allowance_overrides o
    on o.user_id = p_user_id and o.leave_type_id = lt.id and o.year = p_year
  left join lateral (
    select
      sum(r.working_days) filter (where r.status = 'approved') as taken,
      sum(r.working_days) filter (where r.status = 'pending') as pending,
      count(*) as n
    from public.leave_requests r
    where r.user_id = p_user_id and r.leave_type_id = lt.id
      and r.status in ('pending', 'approved')
      and extract(year from r.start_date) = p_year
  ) u on true
  where lt.is_active or u.n > 0
  order by lt.name;
end;
$$;

revoke all on function public.get_balances(uuid, smallint) from public, anon;
grant execute on function public.get_balances(uuid, smallint) to authenticated;

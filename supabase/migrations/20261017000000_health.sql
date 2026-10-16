-- Row 25: health() for the keep-alive workflow. Touches no tables.
create or replace function public.health()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated;

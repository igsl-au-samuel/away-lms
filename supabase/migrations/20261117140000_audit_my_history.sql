-- A055 (spec 002 slice 3, migration A5): the read function behind the My history page.
--
-- `security invoker` on purpose, unlike 001's functions: RLS on audit_log decides every row this
-- returns, so the function can only ever hand back a subset of what the caller could already
-- select (FR-022). It carries one predicate of its own because the policy is wider than this page
-- in exactly one place — an active admin may read every entry (row 29), while a history page is
-- one person's trail (FR-023). Narrowing an admin is the whole of the function's own logic. The
-- employee and manager rules stay RLS's: R6 put them in private.can_view_audit precisely so a
-- second copy could not drift from the first, and a duplicate here would be a second place to
-- decide who a manager can decide for.
--
-- Paging is a keyset on the same (created_at desc, id desc) the table's own recent index uses,
-- and a half cursor is treated as no cursor: a URL with before_at and no before_id gets the newest
-- page rather than an empty list that reads like an empty history. No new index — the four on
-- audit_log (20261116062027_audit_log.sql:40-43) already lead with the columns every page sorts
-- and filters by, and A075 re-measures under 50,000 rows.
create function public.audit_my_history(
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit int default 50
)
returns setof public.audit_log
language sql
stable
security invoker
set search_path = ''
as $$
  select a.*
  from public.audit_log a
  where (
    -- Everything except an admin's view comes straight from the policy, which runs as the invoker.
    not private.is_admin()
    or a.actor_id = auth.uid()
    or a.subject_id = auth.uid()
    -- Defaults belong to everybody, so an admin on this page still sees them (FR-020).
    or a.action = 'leave_type_default_changed'
  )
  and (
    p_before_at is null
    or p_before_id is null
    or (a.created_at, a.id) < (p_before_at, p_before_id)
  )
  order by a.created_at desc, a.id desc
  limit least(coalesce(p_limit, 50), 100);
$$;

revoke all on function public.audit_my_history(timestamptz, bigint, integer) from public, anon;
grant execute on function public.audit_my_history(timestamptz, bigint, integer) to authenticated;

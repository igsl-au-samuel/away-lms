-- A069 (spec 002 slice 4): the Audit page query and the CSV export, over one shared filter.
--
-- Three functions. private.audit_matches holds the seven filter conditions, and both read paths
-- call it, because "the file has exactly the rows the screen showed" (FR-025, R10) is a promise
-- about two queries agreeing. Written twice, the two copies drift and nothing fails until someone
-- compares a page with a download and finds a row in one and not the other.
--
-- All three are `security invoker`, unlike 001's functions: RLS on audit_log decides every row
-- (FR-022). `private.is_admin()` inside the two public ones decides who may ask the question at
-- all (FR-027); it never widens what the caller can see, which stays the policy's job. The admin
-- check runs first, before the timezone is looked at, so a manager poking the export with a bad
-- `p_tz` learns they are not allowed rather than what a valid zone is called.
--
-- Why the filter is a `language sql` function and not plpgsql: it is one boolean expression, which
-- is what a SQL body is for. It is worth recording what that does and does not buy, because the
-- obvious hope is false. Postgres will not inline it — a function carrying a SET clause is never
-- inlined, and every function in this project carries `set search_path = ''`. Measured on the local
-- stack, a filtered page plans as:
--
--   Limit
--     ->  Index Scan using audit_log_recent_idx on audit_log a
--           Index Cond: (ROW(created_at, id) < ROW(now(), 999))
--           Filter: private.audit_matches(a.*, ...)
--
-- so the keyset cursor does use the index, and the seven filter conditions are evaluated per row of
-- that scan until the Limit is satisfied. That is not free, but it is not a new cost either: the
-- select policy is a per-row function call too (research R6), so a page already evaluates a
-- private.* boolean per row before it reaches this one. Dropping the SET clause to buy inlining
-- would trade a convention every function here keeps for a saving nobody has measured yet, so the
-- measurement belongs to A075, on a 50,000-row log, where the fallback for a slow policy path is
-- already written down (R6's inline exists (select private.current_role()) form, plus ADR 0018).
--
-- The export builds its file in SQL for the reason R10 gives: one PostgREST call is one subrequest
-- and near-zero Worker CPU, where paging 10,000 rows through the Worker would be ten calls plus
-- string work in JavaScript. `p_limit + 1` rows are fetched, so `truncated` is known without a
-- second count over the whole filtered set.
--
-- Two places where the contract had to be read narrowly, both recorded here rather than silently:
--
-- 1. research.md R10 describes before/after as `field: old → new`; contracts/database-api.md and
--    A065 both say `field: value; field: value`, one column per side. The contract is the surface,
--    so the contract wins, and the arrow is what the app renders on screen (src/server/audit.ts).
--    Within a column the fields are ordered by field name: jsonb does not preserve insertion order,
--    so an unordered render would shuffle the same entry's line between two exports.
-- 2. `row_count` is the number of rows the file holds, not the number of rows that matched — the
--    file cannot carry more than `p_limit` rows, so anything else would be a count of something the
--    caller cannot check against the download. `truncated` is the flag that says there was more.
--
-- Nulls in the filter never match a row, which is the only sensible reading: an entry with no
-- subject is not "about person X", and an entry with no actor role is not "by a manager".
--
-- `p_limit` is clamped at the top and left alone at the bottom: a negative value is refused by
-- Postgres itself (`LIMIT must not be negative`, SQLSTATE 2201D — measured) rather than silently
-- becoming an unbounded read, and zero gives a header-only file with `truncated` true. The page
-- size that reaches this function is zod-parsed before it leaves the Worker (A066/A070).
--
-- Three CSV traps worth naming, because each one fails quietly:
--   - every cell is coalesced to '' before it enters the array. `array_agg` and `array_to_string`
--     both skip NULLs, so one null cell (a deleted subject's name, most likely) would silently
--     produce an eleven-column row under a twelve-column header.
--   - formula neutralising happens before quoting, so the guard `'` is inside the quotes
--     ("'=1+1") and is part of the cell value. Quoting first would leave the file with a bare
--     `'=1+1` field that a spreadsheet reads as a string but a parser reads as a broken row.
--   - the header carries no quotes and the rows are joined with LF, not CRLF. Both are deliberate:
--     a quoted header stops matching the column list in the contract, and Postgres' own CSV writer
--     uses LF.
--
-- One grant that is not what FR-006 first reads like: authenticated gets execute on
-- private.audit_matches. A security-invoker function runs its body as the calling role, and so does
-- every function that body calls, so without it the Audit page cannot filter at all. It is the same
-- exception can_view_audit already holds for the select policy, and row40's grant sweep is amended
-- in this PR to name both rather than to loosen the prefix. Nothing else in private.audit_* moves:
-- the write plumbing stays owner-only, which is what FR-006 is about.
--
-- `service_role` is not named in the revokes below, which follows every other public RPC in this
-- project (20261117031500_audit_allowance_swap.sql:62, 20261117140000_audit_my_history.sql:47).
-- Supabase's default privileges in schema public hand execute on a new function to service_role, so
-- it does hold the call — and is answered `not_allowed`, because the secret key carries no JWT, so
-- auth.uid() is null and private.is_admin() is false. row41 asserts that outcome instead of
-- pretending the grant is not there.

-- The shared filter. `a public.audit_log` is the whole row: the caller passes the candidate and
-- the function answers whether it matches, so no filter logic exists on either side of the call.
create function private.audit_matches(
  a public.audit_log,
  p_person uuid,
  p_action text,
  p_entity text,
  p_role public.app_role,
  p_demo boolean,
  p_from timestamptz,
  p_to timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (p_person  is null or a.actor_id  = p_person or a.subject_id = p_person)
     and (p_action is null or a.action     = p_action)
     and (p_entity is null or a.entity     = p_entity)
     and (p_role   is null or a.actor_role = p_role)
     and (p_demo   is null or a.is_demo    = p_demo)
     -- p_from is the first instant of the range and p_to the first instant after it, so a day
     -- range that ends today still holds today's entries and the two ends never overlap.
     and (p_from   is null or a.created_at >= p_from)
     and (p_to     is null or a.created_at <  p_to);
$$;

revoke all on function private.audit_matches(
  public.audit_log, uuid, text, text, public.app_role, boolean, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function private.audit_matches(
  public.audit_log, uuid, text, text, public.app_role, boolean, timestamptz, timestamptz
) to authenticated;

-- The Audit page query: every entry an admin can see, newest first, filtered, keyset paged.
-- Paging is the same (created_at desc, id desc) cursor audit_my_history uses, and a half cursor is
-- treated as no cursor for the same reason (20261117140000_audit_my_history.sql:12-16): a URL with
-- before_at and no before_id should show the newest page, not an empty list that reads as no history.
create function public.audit_search(
  p_person uuid default null,
  p_action text default null,
  p_entity text default null,
  p_role public.app_role default null,
  p_demo boolean default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit int default 50
)
returns setof public.audit_log
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active admins can search the audit log.';
  end if;

  return query
  select a.*
  from public.audit_log a
  where private.audit_matches(a, p_person, p_action, p_entity, p_role, p_demo, p_from, p_to)
    and (
      p_before_at is null
      or p_before_id is null
      or (a.created_at, a.id) < (p_before_at, p_before_id)
    )
  order by a.created_at desc, a.id desc
  limit least(coalesce(p_limit, 50), 100);
end;
$$;

revoke all on function public.audit_search(
  uuid, text, text, public.app_role, boolean, timestamptz, timestamptz, timestamptz, bigint, integer
) from public, anon;
grant execute on function public.audit_search(
  uuid, text, text, public.app_role, boolean, timestamptz, timestamptz, timestamptz, bigint, integer
) to authenticated;

-- The export: the same filter, without paging, rendered as a CSV file in SQL.
-- p_tz reads as optional and is not. Postgres refuses to declare a required parameter after one
-- that has a default ("input parameters after one with a default value must also have defaults",
-- raised at create time against this signature), and the contract fixes the order with p_tz last
-- but one, after the seven defaulted filters. So it carries `default null` and the null is refused
-- with invalid_timezone below — which is the point: the alternative default is a guessed zone, and
-- a file whose times silently belong to the database server instead of the viewer is a wrong file
-- nobody can tell from a right one. It also means the generated TypeScript types mark p_tz optional
-- when it is mandatory in every real sense, so A070 must pass it rather than lean on the type.
create function public.audit_export_csv(
  p_person uuid default null,
  p_action text default null,
  p_entity text default null,
  p_role public.app_role default null,
  p_demo boolean default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_tz text default null,
  p_limit int default 10000
)
returns table (csv text, row_count int, truncated boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_cap int := least(coalesce(p_limit, 10000), 10000);
begin
  if not private.is_admin() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active admins can export the audit log.';
  end if;

  -- Validated against the zone database Postgres was built with, so an abbreviation that only
  -- exists in pg_timezone_abbrevs (AEST) is refused: it is not an IANA name, and it means
  -- different offsets in different parts of the year.
  if p_tz is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_tz
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_timezone',
      detail = coalesce('Not an IANA timezone name: ' || p_tz, 'p_tz is required.'),
      hint = 'Use a name such as Australia/Brisbane; see pg_timezone_names.';
  end if;

  return query
  with newest as (
    select
      x.rn,
      (
        select string_agg(
                 '"' || replace(
                          case
                            when left(cell, 1) in ('=', '+', '-', '@', chr(9), chr(13))
                            then '''' || cell
                            else cell
                          end,
                          '"', '""') || '"',
                 ',' order by ord)
        from unnest(array[
          to_char(x.created_at at time zone p_tz, 'YYYY-MM-DD HH24:MI:SS'),
          coalesce(x.actor_name, ''),
          coalesce(x.actor_role::text, ''),
          x.action,
          x.entity,
          coalesce(x.subject_name, ''),
          coalesce((select string_agg(b.key || ': ' || b.value, '; ' order by b.key)
                    from jsonb_each_text(x.before) as b), ''),
          coalesce((select string_agg(f.key || ': ' || f.value, '; ' order by f.key)
                    from jsonb_each_text(x.after) as f), ''),
          coalesce(x.comment, ''),
          x.is_demo::text,
          x.is_backfilled::text,
          x.id::text
        ]) with ordinality as c(cell, ord)
      ) as line
    from (
      select a.*, row_number() over (order by a.created_at desc, a.id desc) as rn
      from public.audit_log a
      where private.audit_matches(a, p_person, p_action, p_entity, p_role, p_demo, p_from, p_to)
      order by a.created_at desc, a.id desc
      limit v_cap + 1
    ) as x
  )
  select
    concat(
      'time,actor,actor_role,action,entity,subject,before,after,comment,demo,backfilled,entry_id',
      coalesce(E'\n' || string_agg(n.line, E'\n' order by n.rn) filter (where n.rn <= v_cap), '')
    ),
    least(count(*), v_cap)::int,
    count(*) > v_cap
  from newest as n;
end;
$$;

revoke all on function public.audit_export_csv(
  uuid, text, text, public.app_role, boolean, timestamptz, timestamptz, text, integer
) from public, anon;
grant execute on function public.audit_export_csv(
  uuid, text, text, public.app_role, boolean, timestamptz, timestamptz, text, integer
) to authenticated;

-- #180 (spec 001 backlog item 8): the leave-utilisation report, in one call.
--
-- Three functions, the same shape the audit export uses (20261118030000_audit_search_export.sql)
-- and for the same reason. private.report_rows holds the arithmetic and both read paths call it, so
-- "the CSV has the rows the screen showed" (the issue's second acceptance criterion) is a promise
-- about one query rather than a hope about two. Written twice, the copies drift and nothing fails
-- until someone compares a page with a download.
--
-- One call, not one per person. A Worker on the free plan gets 50 subrequests per invocation and the
-- demo loader already spends 44 of them (tests/unit/demo-load.test.ts); a report that asked for each
-- person's balances with get_balances would be one call per person and could not render a twelve-person
-- team at all. The whole matrix is one read.
--
-- The arithmetic is get_balances' arithmetic, copied and not re-invented, because a report that
-- disagrees with the balances page is a bug no reader can attribute (FR-010, access matrix row 20):
-- capped types only carry an allowance, uncapped types answer null for it, `available` comes from
-- private.available_balance so an override, a default and the pending-plus-approved subtraction all
-- land the same way they do on the balances panel, and a leave type that has gone inactive still
-- appears when it holds a pending or approved request in the year asked for (`lt.is_active or u.n > 0`,
-- the same clause at 20261017001500_balances.sql:72).
--
-- Security definer on the two public functions, like get_balances: an approver has no select policy
-- over another person's `leave_requests` counts, and the point of the report is everyone's totals. The
-- gate is private.is_approver() (manager or admin, active — 20261017000400_private_helpers.sql:29), so
-- an employee asking for the report is answered `not_allowed` in SQL rather than by a page that knows
-- better than the database. private.report_rows is security invoker: inside a definer caller it runs
-- with the owner's rights anyway, and marking it invoker is what keeps it useless on its own.
--
-- What the report deliberately does NOT carry: a request's `note`, its `decision_comment`, its dates,
-- or anything that names a specific absence. The issue's fourth acceptance criterion asks for that
-- silence, and it is a real one — a utilisation export gets emailed, and a file that leaks that Ada
-- was away in March is a different product from a file that says Ada used three days. row43 asserts
-- the silence by seeding a request whose note is a marker string and searching the whole file for it.
--
-- No row cap, unlike audit_export_csv. The audit log is unbounded history and a cap is what keeps a
-- download from becoming an event; this result set is people multiplied by leave types, which is
-- bounded by the roster. A 10,000-row cap here would only ever hide rows.
--
-- Demo rows are included and labelled rather than hidden. A demo employee pads the real team on the
-- team calendar by design (ADR 0004, matrix D3), and a report that quietly dropped them would make the
-- CSV disagree with the roster a manager is looking at. `is_demo` is the last column so a reader can
-- filter it in a spreadsheet.

-- The matrix itself: every profile, every leave type that is active or holds a counted request in the
-- year. `n` counts pending/approved requests, which is what makes an inactive type visible only when it
-- still matters — the same lateral the balances query uses.
create function private.report_rows(p_year smallint)
returns table (
  person_id uuid,
  person_name text,
  leave_type_id uuid,
  leave_type_name text,
  is_capped boolean,
  allowance numeric,
  taken numeric,
  pending numeric,
  available numeric,
  n bigint,
  is_demo boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    lt.id,
    lt.name,
    lt.is_capped,
    (case when lt.is_capped then coalesce(o.days, lt.default_allowance, 0) end)::numeric(5,1),
    coalesce(u.taken, 0)::numeric(5,1),
    coalesce(u.pending, 0)::numeric(5,1),
    private.available_balance(p.id, lt.id, p_year)::numeric(5,1),
    u.n,
    p.is_demo
  from public.profiles p
  cross join public.leave_types lt
  left join public.allowance_overrides o
    on o.user_id = p.id and o.leave_type_id = lt.id and o.year = p_year
  left join lateral (
    select
      sum(r.working_days) filter (where r.status = 'approved') as taken,
      sum(r.working_days) filter (where r.status = 'pending') as pending,
      count(*) as n
    from public.leave_requests r
    where r.user_id = p.id and r.leave_type_id = lt.id
      and r.status in ('pending', 'approved')
      and extract(year from r.start_date) = p_year
  ) u on true
  where lt.is_active or coalesce(u.n, 0) > 0;
$$;

revoke all on function private.report_rows(smallint) from public, anon, authenticated, service_role;

-- The page read: the matrix, in the order the table shows it.
create function public.leave_report(p_year smallint)
returns table (
  person_id uuid,
  person_name text,
  leave_type_id uuid,
  leave_type_name text,
  is_capped boolean,
  allowance numeric,
  taken numeric,
  pending numeric,
  available numeric,
  is_demo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_approver() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active managers and admins can read the utilisation report.';
  end if;

  -- The order is written here and again in leave_report_csv, rather than trusted from
  -- private.report_rows: a set-returning function's own ORDER BY is not guaranteed to survive into the
  -- caller's result, so sorting once inside the helper is exactly the kind of promise that breaks when
  -- a planner changes. Two named sorts that match are honest; one sort that might be dropped is not.
  return query
  select r.person_id, r.person_name, r.leave_type_id, r.leave_type_name, r.is_capped,
         r.allowance, r.taken, r.pending, r.available, r.is_demo
  from private.report_rows(p_year) as r
  order by r.person_name, r.leave_type_name;
end;
$$;

revoke all on function public.leave_report(smallint) from public, anon;
grant execute on function public.leave_report(smallint) to authenticated;

-- The file: the same rows, the same order, rendered in SQL.
-- The quoting rules are copied from audit_export_csv (20261118030000_audit_search_export.sql:216-241)
-- and the reasons are there: every cell coalesced before it enters the array because array_agg skips
-- NULLs and a short row under a full header reads as a shifted file; formula neutralising before
-- quoting so the guard is inside the quotes; header unquoted; LF between lines. An uncapped type's
-- allowance and available are empty cells, not the word "null", because a spreadsheet turns the second
-- into a zero and a zero allowance is a claim about budget that nobody made.
create function public.leave_report_csv(p_year smallint)
returns table (csv text, row_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_approver() then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active managers and admins can export the utilisation report.';
  end if;

  return query
  with sorted as (
    select r.person_name, r.leave_type_name, r.is_capped, r.allowance, r.taken, r.pending,
           r.available, r.is_demo,
           row_number() over (order by r.person_name, r.leave_type_name) as rn
    from private.report_rows(p_year) as r
  ), lines as (
    select
      s.rn,
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
          coalesce(s.person_name, ''),
          coalesce(s.leave_type_name, ''),
          case when s.is_capped then coalesce(s.allowance::text, '') else '' end,
          s.taken::text,
          s.pending::text,
          case when s.is_capped then coalesce(s.available::text, '') else '' end,
          coalesce(s.is_demo::text, 'false')
        ]) with ordinality as c(cell, ord)
      ) as line
    from sorted s
  )
  select
    concat(
      'person,leave_type,allowance_days,taken_days,pending_days,available_days,demo',
      coalesce(E'\n' || string_agg(l.line, E'\n' order by l.rn), '')
    ),
    count(l.rn)::int
  from lines l;
end;
$$;

revoke all on function public.leave_report_csv(smallint) from public, anon;
grant execute on function public.leave_report_csv(smallint) to authenticated;

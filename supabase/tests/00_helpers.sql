-- pgTAP setup + role-switching helpers shared by every test file.
-- Runs first (alphabetical order). It deliberately does NOT roll back: the
-- `tests` schema must survive for the files that run after it.
-- Includes the user/request fixture helpers (T027).

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
-- service_role is included because tests.as_service() switches to it, and the
-- helper that switches back has to be callable while that role is active. The
-- tests schema only ever exists in a test database; migrations never create it.
grant usage on schema tests to anon, authenticated, service_role;

-- Act as the anonymous (logged-out) role for the rest of the transaction.
create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Act as a signed-in user with the given auth.users id for the rest of the transaction.
create or replace function tests.as_authenticated(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Back to the superuser the test connection started as.
create or replace function tests.reset_role()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

-- Act as the service role: the app's secret key, with no signed-in user behind it.
-- service_role holds BYPASSRLS, so this is how a test reaches rows the impersonated
-- caller cannot see, and how it proves an entry was written from a non-user route.
create or replace function tests.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end;
$$;

grant execute on function tests.as_anon(), tests.as_authenticated(uuid), tests.reset_role(),
  tests.as_service()
  to anon, authenticated, service_role;

-- Fixture helpers: run as the superuser, before switching role. Call them while
-- the role is postgres (or after tests.reset_role()).

-- Insert an auth.users row plus its profile; returns the new uid. The region is
-- created on the fly if it is missing, so tests do not depend on seed data.
create or replace function tests.create_user(
  role public.app_role,
  region text default 'QLD',
  active boolean default true,
  demo boolean default false
)
returns uuid
language plpgsql
as $$
declare
  uid uuid := gen_random_uuid();
  addr text := 'user-' || uid || '@test.local';
begin
  insert into public.holiday_regions (code, name, default_timezone)
  values (region, region, 'Australia/Brisbane')
  on conflict (code) do nothing;

  insert into auth.users (id, aud, role, email, instance_id)
  values (uid, 'authenticated', 'authenticated', addr,
          '00000000-0000-0000-0000-000000000000');

  -- The timezone is normally filled by profiles' before trigger
  -- (20261017000200_profiles.sql:22), which does not fire in an owner session that has run
  -- set session_replication_role = replica; naming it here is what lets a test seed people
  -- with the audit triggers off.
  insert into public.profiles (id, full_name, email, role, region_code, is_active, is_demo, timezone)
  values (uid, 'Test ' || role::text, addr, role, region, active, demo,
          (select default_timezone from public.holiday_regions where code = region));

  return uid;
end;
$$;

-- Insert a leave_requests row directly (bypasses RPCs and RLS). Non-pending
-- statuses need p_decided_by. Creates a leave type when p_leave_type is null.
create or replace function tests.create_request(
  p_user uuid,
  p_start date,
  p_end date,
  p_status public.request_status default 'pending',
  p_decided_by uuid default null,
  p_working_days numeric default null,
  p_leave_type uuid default null
)
returns uuid
language plpgsql
as $$
declare
  type_id uuid := p_leave_type;
  req_id uuid;
begin
  if type_id is null then
    insert into public.leave_types (name, is_capped, default_allowance)
    values ('Test leave ' || gen_random_uuid(), false, null)
    returning id into type_id;
  end if;

  insert into public.leave_requests (
    user_id, leave_type_id, start_date, end_date, region_code, working_days,
    status, decided_by, decided_at
  )
  select p_user, type_id, p_start, p_end, region_code,
         coalesce(p_working_days, p_end - p_start + 1),
         p_status, p_decided_by,
         case when p_status = 'pending' then null else now() end
  from public.profiles where id = p_user
  returning id into req_id;

  return req_id;
end;
$$;

-- Read audit_log as the owner, so a test can assert on entries the role it is
-- impersonating is not allowed to see. Ordered by id, the tie-break the data model
-- defines, and filterable by action.
--
-- Created conditionally: audit_log does not exist until slice 1 (A003+), and a
-- function typed `returns setof public.audit_log` is validated at creation —
-- declaring it plainly here fails with `type "public.audit_log" does not exist`
-- and takes every test file down with it. The guard materialises the helper as
-- soon as the migration lands, so this file needs no follow-up edit.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    execute $guard$
      create or replace function tests.audit_entries(p_action text default null)
      returns setof public.audit_log
      language plpgsql
      stable
      security definer
      set search_path = public
      as $body$
      begin
        return query
          select a.*
          from public.audit_log a
          where p_action is null or a.action = p_action
          order by a.id;
      end;
      $body$;
    $guard$;
    execute 'grant execute on function tests.audit_entries(text) to anon, authenticated, service_role';
  end if;
end $$;

-- The helpers must pass as a test too.
begin;
select plan(14);

select has_schema('tests', 'tests schema exists');

select tests.as_anon();
select is(current_setting('role'), 'anon', 'as_anon switches to anon');

select tests.as_authenticated('00000000-0000-0000-0000-000000000001');
select is(current_setting('role'), 'authenticated', 'as_authenticated switches to authenticated');
select is(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid, 'as_authenticated sets auth.uid()');

select tests.reset_role();
select is(current_setting('role'), 'postgres', 'reset_role restores postgres');
select is(auth.uid(), null, 'reset_role clears the JWT claims');

select tests.as_service();
select is(current_setting('role'), 'service_role', 'as_service switches to service_role');
select is(auth.uid(), null, 'as_service carries no JWT claims');

select tests.reset_role();
select is(
  case
    when to_regclass('public.audit_log') is null then true
    else (
      select count(*) = 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'tests' and p.proname = 'audit_entries'
    )
  end,
  true,
  'audit_entries is declared once audit_log exists'
);

select tests.create_user('manager', 'NSW', true, false) as mgr \gset
select tests.create_user('employee', 'QLD', false, true) as emp \gset

select is(
  (select role::text || '/' || region_code from public.profiles where id = :'mgr'),
  'manager/NSW',
  'create_user inserts a profile with the given role and region'
);
select is(
  (select is_active::text || '/' || is_demo::text from public.profiles where id = :'emp'),
  'false/true',
  'create_user honours active and demo flags'
);
select is(
  (select count(*)::int from auth.users where id in (:'mgr', :'emp')),
  2,
  'create_user inserts auth.users rows'
);

select tests.create_request(:'emp', '2026-03-02', '2026-03-04') as pend \gset
select tests.create_request(:'emp', '2026-04-06', '2026-04-06', 'approved', :'mgr') as appr \gset

select is(
  (select status::text || '/' || working_days::text from public.leave_requests where id = :'pend'),
  'pending/3.0',
  'create_request inserts a pending request with default working days'
);
select is(
  (select status::text || '/' || (decided_by = :'mgr')::text from public.leave_requests where id = :'appr'),
  'approved/true',
  'create_request inserts a decided request'
);

select * from finish();
rollback;

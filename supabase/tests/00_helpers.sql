-- pgTAP setup + role-switching helpers shared by every test file.
-- Runs first (alphabetical order). It deliberately does NOT roll back: the
-- `tests` schema must survive for the files that run after it.
-- Includes the user/request fixture helpers (T027).

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

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

grant execute on function tests.as_anon(), tests.as_authenticated(uuid), tests.reset_role()
  to anon, authenticated;

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

  insert into public.profiles (id, full_name, email, role, region_code, is_active, is_demo)
  values (uid, 'Test ' || role::text, addr, role, region, active, demo);

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

-- The helpers must pass as a test too.
begin;
select plan(11);

select has_schema('tests', 'tests schema exists');

select tests.as_anon();
select is(current_setting('role'), 'anon', 'as_anon switches to anon');

select tests.as_authenticated('00000000-0000-0000-0000-000000000001');
select is(current_setting('role'), 'authenticated', 'as_authenticated switches to authenticated');
select is(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid, 'as_authenticated sets auth.uid()');

select tests.reset_role();
select is(current_setting('role'), 'postgres', 'reset_role restores postgres');
select is(auth.uid(), null, 'reset_role clears the JWT claims');

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

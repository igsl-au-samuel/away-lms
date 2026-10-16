-- pgTAP setup + role-switching helpers shared by every test file.
-- Runs first (alphabetical order). It deliberately does NOT roll back: the
-- `tests` schema must survive for the files that run after it.
-- User-creating helpers arrive with T027, once `profiles` exists.

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

-- The helpers must pass as a test too.
begin;
select plan(6);

select has_schema('tests', 'tests schema exists');

select tests.as_anon();
select is(current_setting('role'), 'anon', 'as_anon switches to anon');

select tests.as_authenticated('00000000-0000-0000-0000-000000000001');
select is(current_setting('role'), 'authenticated', 'as_authenticated switches to authenticated');
select is(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid, 'as_authenticated sets auth.uid()');

select tests.reset_role();
select is(current_setting('role'), 'postgres', 'reset_role restores postgres');
select is(auth.uid(), null, 'reset_role clears the JWT claims');

select * from finish();
rollback;

-- Access matrix row 3: nobody, not even an admin, writes role, is_active,
-- is_demo or email directly, or inserts or deletes profiles. Those go through
-- the admin RPCs.
begin;
select plan(18);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

select tests.as_authenticated(:'emp');
select throws_ok(
  format('update public.profiles set %I = %s where id = %L', col, val, :'emp'),
  '42501', null, 'employee cannot update own ' || col
) from (values ('role', '''admin'''), ('is_active', 'false'), ('is_demo', 'true'),
             ('email', '''changed@test.local''')) as protected_cols (col, val);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('update public.profiles set %I = %s where id = %L', col, val, :'mgr'),
  '42501', null, 'manager cannot update own ' || col
) from (values ('role', '''admin'''), ('is_active', 'false'), ('is_demo', 'true'),
             ('email', '''changed@test.local''')) as protected_cols (col, val);

select tests.as_authenticated(:'adm');
select throws_ok(
  format('update public.profiles set %I = %s where id = %L', col, val, :'emp'),
  '42501', null, 'admin cannot update ' || col || ' directly'
) from (values ('role', '''admin'''), ('is_active', 'false'), ('is_demo', 'true'),
             ('email', '''changed@test.local''')) as protected_cols (col, val);

select tests.as_authenticated(:'off');
select throws_ok(
  format('update public.profiles set role = %L where id = %L', 'admin', :'off'),
  '42501', null, 'inactive user cannot update own role'
);

select tests.as_anon();
select throws_ok(
  format('update public.profiles set role = %L where id = %L', 'admin', :'emp'),
  '42501', null, 'anon cannot update role'
);

-- Inserts and deletes.
select tests.as_authenticated(:'emp');
select throws_ok(
  format(
    'insert into public.profiles (id, full_name, email, region_code, timezone) values (%L, %L, %L, %L, %L)',
    gen_random_uuid(), 'Sneaky', 'sneaky-emp@test.local', 'QLD', 'Australia/Brisbane'
  ),
  '42501', null, 'employee cannot insert a profile'
);
select throws_ok(
  format('delete from public.profiles where id = %L', :'emp'),
  '42501', null, 'employee cannot delete own profile'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  format(
    'insert into public.profiles (id, full_name, email, region_code, timezone) values (%L, %L, %L, %L, %L)',
    gen_random_uuid(), 'Sneaky', 'sneaky-adm@test.local', 'QLD', 'Australia/Brisbane'
  ),
  '42501', null, 'admin cannot insert a profile directly'
);
select throws_ok(
  format('delete from public.profiles where id = %L', :'emp'),
  '42501', null, 'admin cannot delete a profile directly'
);

select * from finish();
rollback;

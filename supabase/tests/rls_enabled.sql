-- Every table in public has RLS enabled, anon can write to none of them, and
-- authenticated cannot truncate any of them.
begin;
select plan(3);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '',
  'RLS is enabled on every table in public'
);

select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', ' order by table_name), '')
   from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '',
  'anon has no write grants on any table in public'
);

-- TRUNCATE ignores RLS, so a truncate grant would bypass every policy.
select is(
  (select coalesce(string_agg(table_name, ', ' order by table_name), '')
   from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'authenticated'
     and privilege_type = 'TRUNCATE'),
  '',
  'authenticated has no truncate grant on any table in public'
);

select * from finish();
rollback;

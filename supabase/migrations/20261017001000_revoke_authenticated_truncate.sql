-- TRUNCATE ignores RLS, and Supabase's default privileges give authenticated
-- truncate on every new table. Signed-in users never truncate: drop it on
-- existing tables and for future ones (same idea as the anon revoke).
revoke truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate on tables from authenticated;

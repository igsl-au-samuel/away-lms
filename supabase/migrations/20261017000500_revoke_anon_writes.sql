-- Supabase's default privileges give anon full DML on new tables. Logged-out
-- users never write: drop it on existing tables and for future ones.
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

-- research R1: how an entry learns who made it. Three outcomes — a signed-in person,
-- System when there is no sub at all, and Unknown user for a uid with no profile — plus
-- the rule that the recorded role is the one held at that moment.
--
-- auth.uid() reads the request's JWT claims rather than the database role, which is what
-- lets a security definer trigger running as the owner still name the caller. These tests
-- reproduce that exactly: they set the claims and stay the owner, because private.audit_actor
-- is revoked from authenticated. Every case below therefore reads the actor from inside a
-- security definer function, which is the property R1 depends on.
begin;
select plan(5);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('admin', 'QLD') as adm \gset

select set_config('request.jwt.claims',
  json_build_object('sub', :'emp', 'role', 'authenticated')::text, true);

select is(
  (select p_id::text || '/' || coalesce(p_role::text, 'null') || '/' || p_name
   from private.audit_actor()),
  (select id::text || '/employee/' || full_name from public.profiles where id = :'emp'),
  'a signed-in employee is the actor, with the role and name they hold'
);

-- ADR 0007: the role comes from the table, not from a claim. Promoting the same uid changes
-- what the next entry records, with the claims untouched.
update public.profiles set role = 'manager' where id = :'emp';

select is(
  (select p_role::text from private.audit_actor()),
  'manager',
  'the actor role is the one held now, not the one in the JWT'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'adm', 'role', 'authenticated')::text, true);

select is(
  (select p_role::text || '/' || p_name from private.audit_actor()),
  'admin/' || (select full_name from public.profiles where id = :'adm'),
  'an admin is recorded as admin'
);

-- The secret key, Studio, migrations and psql all land here: no sub, so no person.
select set_config('request.jwt.claims', '', true);

select is(
  (select coalesce(p_id::text, 'null') || '/' || coalesce(p_role::text, 'null') || '/' || p_name
   from private.audit_actor()),
  'null/null/System',
  'no JWT subject means the actor is System'
);

-- A real uid that has no profile row: the id is still the truth, the label is not.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000099', 'role', 'authenticated')::text, true);

select is(
  (select p_id::text || '/' || coalesce(p_role::text, 'null') || '/' || p_name
   from private.audit_actor()),
  '00000000-0000-0000-0000-000000000099/null/Unknown user',
  'a uid with no profile keeps its id and is labelled Unknown user'
);

select * from finish();
rollback;

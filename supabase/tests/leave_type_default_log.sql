-- Research R12, FR-008a: changing a leave type's default_allowance writes one
-- allowance_changes row with user_id null (old, new, caller, time). Renaming,
-- re-sorting or retiring a type writes none.
begin;
select plan(8);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Study', true, 5);
select id as study from public.leave_types where name = 'Study' \gset

select tests.as_authenticated(:'adm');
update public.leave_types set default_allowance = 7 where id = :'study';
select tests.reset_role();

select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study'),
  1,
  'a default change writes one log row'
);
select results_eq(
  format($$select user_id, year, old_days, new_days, changed_by from public.allowance_changes
           where leave_type_id = %L$$, :'study'),
  format($$values (null::uuid, null::smallint, 5.0::numeric(5,1), 7.0::numeric(5,1), %L::uuid)$$, :'adm'),
  'the row has user_id null, the old and new days and the caller'
);
select ok(
  (select changed_at is not null from public.allowance_changes where leave_type_id = :'study'),
  'the row has a time'
);

-- No row: rename, re-sort, retire, or an update that leaves the default as it is.
select tests.as_authenticated(:'adm');
update public.leave_types set name = 'Study leave' where id = :'study';
update public.leave_types set sort_order = 9 where id = :'study';
update public.leave_types set is_active = false where id = :'study';
update public.leave_types set default_allowance = 7 where id = :'study';
select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study'),
  1,
  'renaming, re-sorting and retiring write no log row'
);

-- Uncapping (default to null) and capping again are default changes too.
select tests.as_authenticated(:'adm');
update public.leave_types set is_capped = false, default_allowance = null where id = :'study';
update public.leave_types set is_capped = true, default_allowance = 3 where id = :'study';
select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study'),
  3,
  'uncapping and capping again each write a row'
);
select is(
  (select array_agg(coalesce(new_days::text, 'null') order by id) from public.allowance_changes
   where leave_type_id = :'study'),
  array['7.0', 'null', '3.0'],
  'the rows record each new default in order'
);

-- A new type is not a change: inserting writes nothing.
select tests.as_authenticated(:'adm');
insert into public.leave_types (name, is_capped, default_allowance) values ('Training', true, 2);
select tests.reset_role();
select is(
  (select count(*)::int from public.allowance_changes c
   join public.leave_types t on t.id = c.leave_type_id where t.name = 'Training'),
  0,
  'inserting a leave type writes no log row'
);

-- Everyone sees default-change rows (user_id null).
select tests.as_authenticated(:'emp');
select is(
  (select count(*)::int from public.allowance_changes where leave_type_id = :'study' and user_id is null),
  3,
  'an employee sees the default-change rows'
);

select * from finish();
rollback;

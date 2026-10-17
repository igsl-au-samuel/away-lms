-- Access matrix row 11: nobody inserts, updates or deletes leave_requests directly.
-- Requests are created by submit_leave_request and decided by decide_leave_request.
begin;
select plan(11);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row11 annual', true, 20) returning id as lt \gset
select tests.create_request(:'emp', '2026-03-02', '2026-03-04', 'pending', null, null, :'lt') as req \gset

\set ins 'insert into public.leave_requests (user_id, leave_type_id, start_date, end_date, region_code, working_days) values (%L, %L, ''2026-09-07'', ''2026-09-07'', ''QLD'', 1)'

select tests.as_authenticated(:'emp');
select throws_ok(
  format(:'ins', :'emp', :'lt'),
  '42501', null, 'employee cannot insert their own request directly'
);
select throws_ok(
  format('update public.leave_requests set working_days = 1 where id = %L', :'req'),
  '42501', null, 'employee cannot update their own request'
);
select throws_ok(
  format('delete from public.leave_requests where id = %L', :'req'),
  '42501', null, 'employee cannot delete their own request'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format(:'ins', :'emp', :'lt'),
  '42501', null, 'manager cannot insert a request directly'
);
select throws_ok(
  format('update public.leave_requests set status = %L, decided_by = %L, decided_at = now() where id = %L',
         'approved', :'mgr', :'req'),
  '42501', null, 'manager cannot approve by updating the row'
);
select throws_ok(
  format('delete from public.leave_requests where id = %L', :'req'),
  '42501', null, 'manager cannot delete a request'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  format(:'ins', :'adm', :'lt'),
  '42501', null, 'admin cannot insert a request directly'
);
select throws_ok(
  format('update public.leave_requests set working_days = 1 where id = %L', :'req'),
  '42501', null, 'admin cannot update a request'
);
select throws_ok(
  format('delete from public.leave_requests where id = %L', :'req'),
  '42501', null, 'admin cannot delete a request'
);

select tests.as_anon();
select throws_ok(
  format(:'ins', :'emp', :'lt'),
  '42501', null, 'anon cannot insert a request'
);

select tests.reset_role();
select is(
  (select status::text || '/' || working_days::text from public.leave_requests where id = :'req'),
  'pending/3.0',
  'the request is unchanged'
);

select * from finish();
rollback;

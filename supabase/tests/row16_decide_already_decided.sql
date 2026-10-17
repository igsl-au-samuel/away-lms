-- Access matrix row 16: a decided request is final. Managers and admins who may
-- decide it get already_decided; the stored decision does not change. Everyone
-- else is refused before the status is looked at.
begin;
select plan(10);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset

select tests.create_request(:'emp', '2026-09-07', '2026-09-08', 'approved', :'mgr') as r_appr \gset
select tests.create_request(:'emp', '2026-09-14', '2026-09-15', 'declined', :'adm') as r_decl \gset
update public.leave_requests set decision_comment = 'First answer' where id in (:'r_appr', :'r_decl');

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_appr', 'declined', 'Changed my mind'),
  'P0001', 'already_decided', 'manager: an approved request cannot be decided again'
);
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_decl', 'approved', 'Changed my mind'),
  'P0001', 'already_decided', 'manager: a declined request cannot be decided again'
);
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_appr', 'approved', null),
  'P0001', 'already_decided', 'manager: the same outcome twice is still already_decided'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_appr', 'declined', null),
  'P0001', 'already_decided', 'admin: an approved request cannot be decided again'
);
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_decl', 'approved', null),
  'P0001', 'already_decided', 'admin: a declined request cannot be decided again'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_appr', 'declined', null),
  'P0001', 'not_allowed', 'employee: refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_appr', 'declined', null),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select status::text || '/' || decided_by::text || '/' || decision_comment
   from public.leave_requests where id = :'r_appr'),
  'approved/' || :'mgr' || '/First answer',
  'the approved decision is untouched'
);
select is(
  (select status::text || '/' || decided_by::text || '/' || decision_comment
   from public.leave_requests where id = :'r_decl'),
  'declined/' || :'adm' || '/First answer',
  'the declined decision is untouched'
);

-- A requester's own decided request still reports own_request, not already_decided.
select tests.create_request(:'mgr', '2026-10-05', '2026-10-06', 'approved', :'adm') as r_own \gset
select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_own', 'declined', null),
  'P0001', 'own_request', 'own decided request reports own_request'
);

select * from finish();
rollback;

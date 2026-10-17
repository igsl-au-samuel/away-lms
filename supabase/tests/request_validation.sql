-- Request validation (FR-012, FR-013): submit_leave_request raises each code;
-- preview_leave_request reports the same problems in errors[] instead of raising.
begin;
select plan(26);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Validation annual', true, 20) returning id as lt \gset
insert into public.leave_types (name, is_capped, default_allowance, is_active)
values ('Validation retired', true, 10, false) returning id as old \gset

-- Existing requests: pending 2-4 Mar, approved 13-14 Apr, declined 11-12 May.
select tests.create_request(:'emp', '2026-03-02', '2026-03-04', 'pending', null, null, :'lt');
select tests.create_request(:'emp', '2026-04-13', '2026-04-14', 'approved', :'mgr', null, :'lt');
select tests.create_request(:'emp', '2026-05-11', '2026-05-12', 'declined', :'mgr', null, :'lt');

\set submit 'select public.submit_leave_request(%L, %L, %L, %L)'

select tests.as_authenticated(:'emp');

-- submit: each blocking problem raises its code.
select throws_ok(
  format(:'submit', :'lt', '2026-09-10', '2026-09-09', null),
  'P0001', 'invalid_range', 'end before start raises invalid_range'
);
select throws_ok(
  format(:'submit', :'lt', null, '2026-09-09', null),
  'P0001', 'invalid_range', 'a missing start date raises invalid_range'
);
select throws_ok(
  format(:'submit', :'lt', '2026-12-30', '2027-01-04', null),
  'P0001', 'spans_years', 'a range across 31 December raises spans_years'
);
select throws_ok(
  format(:'submit', :'lt', '2026-08-15', '2026-08-16', null),
  'P0001', 'no_working_days', 'a weekend-only range raises no_working_days'
);
select throws_ok(
  format(:'submit', :'lt', '2026-08-12', '2026-08-12', null),
  'P0001', 'no_working_days', 'a single QLD holiday raises no_working_days'
);
select throws_ok(
  format(:'submit', :'lt', '2026-03-04', '2026-03-06', null),
  'P0001', 'overlap', 'overlapping a pending request raises overlap'
);
select throws_ok(
  format(:'submit', :'lt', '2026-04-14', '2026-04-14', null),
  'P0001', 'overlap', 'overlapping an approved request raises overlap'
);
select throws_ok(
  format(:'submit', :'old', '2026-09-07', '2026-09-08', null),
  'P0001', 'type_inactive', 'a retired leave type raises type_inactive'
);
select throws_ok(
  format(:'submit', gen_random_uuid(), '2026-09-07', '2026-09-08', null),
  'P0001', 'type_inactive', 'an unknown leave type raises type_inactive'
);
select throws_ok(
  format(:'submit', :'lt', '2026-09-07', '2026-09-08', repeat('x', 501)),
  'P0001', 'note_too_long', 'a 501-character note raises note_too_long'
);

-- submit: allowed cases.
select lives_ok(
  format(:'submit', :'lt', '2026-05-11', '2026-05-12', null),
  'a declined request does not block the same dates'
);
select lives_ok(
  format(:'submit', :'lt', '2026-01-05', '2026-01-06', null),
  'past dates are allowed'
);
select lives_ok(
  format(:'submit', :'lt', '2026-06-01', '2026-06-02', repeat('x', 500)),
  'a 500-character note is allowed'
);

-- preview: same rules, reported not raised.
select is(
  (select errors from public.preview_leave_request(:'lt', '2026-08-10', '2026-08-14')),
  '{}'::text[],
  'preview of a valid range has no errors'
);
select is(
  (select working_days from public.preview_leave_request(:'lt', '2026-08-10', '2026-08-14')),
  4::numeric,
  'preview counts the Ekka week as 4'
);
select is(
  (select errors from public.preview_leave_request(:'lt', '2026-09-10', '2026-09-09')),
  array['invalid_range'],
  'preview reports invalid_range'
);
select is(
  (select working_days from public.preview_leave_request(:'lt', '2026-09-10', '2026-09-09')),
  null::numeric,
  'preview of an invalid range has no working-day count'
);
select ok(
  (select 'spans_years' = any(errors) from public.preview_leave_request(:'lt', '2026-12-30', '2027-01-04')),
  'preview reports spans_years'
);
select is(
  (select errors from public.preview_leave_request(:'lt', '2026-08-15', '2026-08-16')),
  array['no_working_days'],
  'preview reports no_working_days'
);
select is(
  (select working_days from public.preview_leave_request(:'lt', '2026-08-15', '2026-08-16')),
  0::numeric,
  'preview of a weekend counts 0'
);
select is(
  (select errors from public.preview_leave_request(:'lt', '2026-03-03', '2026-03-03')),
  array['overlap'],
  'preview reports overlap with a pending request'
);
select is(
  (select errors from public.preview_leave_request(:'lt', '2026-04-10', '2026-04-13')),
  array['overlap'],
  'preview reports overlap with an approved request'
);
select is(
  (select errors from public.preview_leave_request(:'old', '2026-09-07', '2026-09-08')),
  array['type_inactive'],
  'preview reports type_inactive'
);
select is(
  (select errors from public.preview_leave_request(:'old', '2026-08-15', '2026-08-16')),
  array['type_inactive', 'no_working_days'],
  'preview reports several problems at once'
);

select tests.reset_role();
select is(
  (select count(*)::int from public.leave_requests where user_id = :'emp'),
  6,
  'only the three allowed submits were stored (3 fixtures + 3)'
);

select tests.as_anon();
select throws_ok(
  format('select public.preview_leave_request(%L, %L, %L)', :'lt', '2026-08-10', '2026-08-14'),
  '42501', null, 'anon cannot preview'
);

select * from finish();
rollback;

-- T032: reference data — regions and default leave types (idempotent).
insert into public.holiday_regions (code, name, default_timezone) values
  ('QLD', 'Queensland (Brisbane)', 'Australia/Brisbane'),
  ('NSW', 'New South Wales (Sydney)', 'Australia/Sydney'),
  ('HK',  'Hong Kong', 'Asia/Hong_Kong')
on conflict do nothing;

insert into public.leave_types (name, is_capped, default_allowance, sort_order) values
  ('Annual',        true,  20, 1),
  ('Personal/Sick', true,  10, 2),
  ('Unpaid',        false, null, 3)
on conflict do nothing;

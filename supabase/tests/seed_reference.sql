-- T031: reference seed — regions, leave types, 2026/2027 holidays (ADR 0008).
begin;
select plan(9);

select is(
  (select string_agg(code || '=' || default_timezone, ', ' order by code)
   from public.holiday_regions where code in ('HK', 'NSW', 'QLD')),
  'HK=Asia/Hong_Kong, NSW=Australia/Sydney, QLD=Australia/Brisbane',
  'regions QLD, NSW, HK exist with their timezones'
);

select is(
  (select string_agg(name || ':' || is_capped || ':' || coalesce(default_allowance::text, 'null'), ', ' order by sort_order)
   from public.leave_types where name in ('Annual', 'Personal/Sick', 'Unpaid')),
  'Annual:true:20.0, Personal/Sick:true:10.0, Unpaid:false:null',
  'leave types Annual 20, Personal/Sick 10, Unpaid uncapped'
);

select ok(
  exists (
    select 1 from public.public_holidays
    where region_code = 'QLD' and holiday_date in ('2026-08-12', '2027-08-11') and name ilike '%Show%'
    having count(*) = 2
  ),
  'QLD includes the Brisbane Show (Ekka) day in 2026 and 2027'
);

select is(
  (select count(*)::int from (values ('QLD'), ('NSW'), ('HK')) r(code)
   cross join (values (2026), (2027)) y(yr)
   where not exists (
     select 1 from public.public_holidays h
     where h.region_code = r.code and extract(year from h.holiday_date) = y.yr)),
  0,
  'every region has holidays for 2026 and 2027'
);

select is(
  (select count(*)::int from public.public_holidays where region_code = 'QLD' and extract(year from holiday_date) = 2026),
  12,
  'QLD 2026 has 12 holiday dates'
);

select is(
  (select count(*)::int from public.public_holidays where region_code = 'NSW' and extract(year from holiday_date) = 2026),
  12,
  'NSW 2026 has 12 holiday dates'
);

select is(
  (select count(*)::int from public.public_holidays where region_code = 'HK' and extract(year from holiday_date) = 2026),
  17,
  'HK 2026 has 17 non-Sunday holiday dates'
);

select is(
  (select count(*)::int from public.public_holidays where region_code = 'HK' and extract(year from holiday_date) = 2027),
  17,
  'HK 2027 has 17 non-Sunday holiday dates'
);

select is(
  (select count(*)::int from public.public_holidays where extract(isodow from holiday_date) = 7),
  0,
  'no seeded holiday falls on a Sunday'
);

select * from finish();
rollback;

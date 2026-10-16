-- T033: Queensland public holidays 2026–2027 (ADR 0008).
-- Source: Queensland Government, https://www.qld.gov.au/recreation/travel/holidays/public
-- (2027 Anzac Day substitute Mon 26 Apr confirmed against Fair Work, 2027 public holidays).
-- Sundays are omitted (weekends never count as working days). Christmas Eve is a
-- part-day holiday and is not seeded. Ekka is the Brisbane-area Royal Queensland Show day.
-- Re-check once a year (ADR 0008).
insert into public.public_holidays (region_code, holiday_date, name) values
  ('QLD', '2026-01-01', 'New Year''s Day'),
  ('QLD', '2026-01-26', 'Australia Day'),
  ('QLD', '2026-04-03', 'Good Friday'),
  ('QLD', '2026-04-04', 'Day after Good Friday'),
  ('QLD', '2026-04-06', 'Easter Monday'),
  ('QLD', '2026-04-25', 'Anzac Day'),
  ('QLD', '2026-05-04', 'Labour Day'),
  ('QLD', '2026-08-12', 'Royal Queensland Show (Ekka)'),
  ('QLD', '2026-10-05', 'King''s Birthday'),
  ('QLD', '2026-12-25', 'Christmas Day'),
  ('QLD', '2026-12-26', 'Boxing Day'),
  ('QLD', '2026-12-28', 'Boxing Day (substitute)'),
  ('QLD', '2027-01-01', 'New Year''s Day'),
  ('QLD', '2027-01-26', 'Australia Day'),
  ('QLD', '2027-03-26', 'Good Friday'),
  ('QLD', '2027-03-27', 'Day after Good Friday'),
  ('QLD', '2027-03-29', 'Easter Monday'),
  ('QLD', '2027-04-26', 'Anzac Day (substitute)'),
  ('QLD', '2027-05-03', 'Labour Day'),
  ('QLD', '2027-08-11', 'Royal Queensland Show (Ekka)'),
  ('QLD', '2027-10-04', 'King''s Birthday'),
  ('QLD', '2027-12-25', 'Christmas Day'),
  ('QLD', '2027-12-27', 'Christmas Day (substitute)'),
  ('QLD', '2027-12-28', 'Boxing Day (substitute)')
on conflict do nothing;

-- T034: NSW public holidays 2026–2027 (ADR 0008).
-- Source: NSW Government, https://www.nsw.gov.au/about-nsw/public-holidays
-- Statutory public holidays only; the August Bank Holiday is not seeded.
-- Sundays are omitted (weekends never count as working days). Re-check once a year.
insert into public.public_holidays (region_code, holiday_date, name) values
  ('NSW', '2026-01-01', 'New Year''s Day'),
  ('NSW', '2026-01-26', 'Australia Day'),
  ('NSW', '2026-04-03', 'Good Friday'),
  ('NSW', '2026-04-04', 'Easter Saturday'),
  ('NSW', '2026-04-06', 'Easter Monday'),
  ('NSW', '2026-04-25', 'Anzac Day'),
  ('NSW', '2026-04-27', 'Anzac Day (additional day)'),
  ('NSW', '2026-06-08', 'King''s Birthday'),
  ('NSW', '2026-10-05', 'Labour Day'),
  ('NSW', '2026-12-25', 'Christmas Day'),
  ('NSW', '2026-12-26', 'Boxing Day'),
  ('NSW', '2026-12-28', 'Boxing Day (additional day)'),
  ('NSW', '2027-01-01', 'New Year''s Day'),
  ('NSW', '2027-01-26', 'Australia Day'),
  ('NSW', '2027-03-26', 'Good Friday'),
  ('NSW', '2027-03-27', 'Easter Saturday'),
  ('NSW', '2027-03-29', 'Easter Monday'),
  ('NSW', '2027-04-26', 'Anzac Day (additional day)'),
  ('NSW', '2027-06-14', 'King''s Birthday'),
  ('NSW', '2027-10-04', 'Labour Day'),
  ('NSW', '2027-12-25', 'Christmas Day'),
  ('NSW', '2027-12-27', 'Christmas Day (additional day)'),
  ('NSW', '2027-12-28', 'Boxing Day (additional day)')
on conflict do nothing;

-- T035: Hong Kong general holidays 2026–2027 (ADR 0008).
-- Sources: HKSAR Government, https://www.gov.hk/en/about/abouthk/holiday/2026.htm and
-- .../2027.htm; 2026 list per https://www.info.gov.hk/gia/general/202505/16/P2025051300353.htm.
-- Sundays are general holidays but omitted here (weekends never count as working days);
-- substituted days are included. Re-check once a year.
insert into public.public_holidays (region_code, holiday_date, name) values
  ('HK', '2026-01-01', 'The first day of January'),
  ('HK', '2026-02-17', 'Lunar New Year''s Day'),
  ('HK', '2026-02-18', 'The second day of Lunar New Year'),
  ('HK', '2026-02-19', 'The third day of Lunar New Year'),
  ('HK', '2026-04-03', 'Good Friday'),
  ('HK', '2026-04-04', 'The day following Good Friday'),
  ('HK', '2026-04-06', 'The day following Ching Ming Festival'),
  ('HK', '2026-04-07', 'Easter Monday (additional holiday)'),
  ('HK', '2026-05-01', 'Labour Day'),
  ('HK', '2026-05-25', 'The day following the Birthday of the Buddha'),
  ('HK', '2026-06-19', 'Tuen Ng Festival'),
  ('HK', '2026-07-01', 'HKSAR Establishment Day'),
  ('HK', '2026-09-26', 'The day following the Chinese Mid-Autumn Festival'),
  ('HK', '2026-10-01', 'National Day'),
  ('HK', '2026-10-19', 'The day following Chung Yeung Festival'),
  ('HK', '2026-12-25', 'Christmas Day'),
  ('HK', '2026-12-26', 'The first weekday after Christmas Day'),
  ('HK', '2027-01-01', 'The first day of January'),
  ('HK', '2027-02-06', 'Lunar New Year''s Day'),
  ('HK', '2027-02-08', 'The third day of Lunar New Year'),
  ('HK', '2027-02-09', 'The fourth day of Lunar New Year (substitute)'),
  ('HK', '2027-03-26', 'Good Friday'),
  ('HK', '2027-03-27', 'The day following Good Friday'),
  ('HK', '2027-03-29', 'Easter Monday'),
  ('HK', '2027-04-05', 'Ching Ming Festival'),
  ('HK', '2027-05-01', 'Labour Day'),
  ('HK', '2027-05-13', 'The Birthday of the Buddha'),
  ('HK', '2027-06-09', 'Tuen Ng Festival'),
  ('HK', '2027-07-01', 'HKSAR Establishment Day'),
  ('HK', '2027-09-16', 'The day following the Chinese Mid-Autumn Festival'),
  ('HK', '2027-10-01', 'National Day'),
  ('HK', '2027-10-08', 'Chung Yeung Festival'),
  ('HK', '2027-12-25', 'Christmas Day'),
  ('HK', '2027-12-27', 'The first weekday after Christmas Day (substitute)')
on conflict do nothing;

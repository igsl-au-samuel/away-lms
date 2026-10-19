-- private.count_working_days(region, start, end): Saturdays, Sundays and the
-- region's public holidays are skipped (FR-012, US2-1, US2-2, SC-004).
-- Uses the seeded 2026 holidays. Expected values are counted by hand:
--   Aug 2026: Mon 10, Tue 11, Wed 12 (Ekka, QLD only), Thu 13, Fri 14, Sat 15, Sun 16
--   Oct 2026: Mon 19 (HK only: day after Chung Yeung) .. Fri 23
--   Feb 2026: Mon 16 .. Fri 20; HK Lunar New Year Tue 17, Wed 18, Thu 19
--   Dec 2026: Mon 21 .. Thu 31; QLD Christmas Fri 25, Boxing Day Sat 26, substitute Mon 28
begin;
select plan(18);

select has_function(
  'private', 'count_working_days', array['text', 'date', 'date'],
  'private.count_working_days(region, start, end) exists'
);

-- The Ekka week: QLD versus NSW.
select is(private.count_working_days('QLD', '2026-08-10', '2026-08-14'), 4::numeric,
  'QLD Ekka week (Mon-Fri) is 4 working days');
select is(private.count_working_days('NSW', '2026-08-10', '2026-08-14'), 5::numeric,
  'the same week in NSW is 5 working days');
select is(private.count_working_days('QLD', '2026-08-10', '2026-08-16'), 4::numeric,
  'QLD Mon-Sun: the weekend adds nothing');

-- A holiday only one region has.
select is(private.count_working_days('HK', '2026-10-19', '2026-10-23'), 4::numeric,
  'HK skips its own holiday on Mon 19 Oct');
select is(private.count_working_days('QLD', '2026-10-19', '2026-10-23'), 5::numeric,
  'QLD does not skip the HK-only holiday');
select is(private.count_working_days('HK', '2026-02-16', '2026-02-20'), 2::numeric,
  'HK Lunar New Year week is 2 working days');
select is(private.count_working_days('NSW', '2026-02-16', '2026-02-20'), 5::numeric,
  'the same week in NSW is 5 working days');

-- Weekends and edges.
select is(private.count_working_days('QLD', '2026-08-15', '2026-08-16'), 0::numeric,
  'a weekend-only range is 0');
select is(private.count_working_days('QLD', '2026-08-08', '2026-08-12'), 2::numeric,
  'starts on a Saturday, ends on the Ekka: Mon and Tue only');
select is(private.count_working_days('QLD', '2026-08-12', '2026-08-16'), 2::numeric,
  'starts on the Ekka, ends on a Sunday: Thu and Fri only');
select is(private.count_working_days('NSW', '2026-08-12', '2026-08-16'), 3::numeric,
  'the same range in NSW: Wed, Thu, Fri');

-- Single days.
select is(private.count_working_days('QLD', '2026-08-13', '2026-08-13'), 1::numeric,
  'a single working day is 1');
select is(private.count_working_days('QLD', '2026-08-12', '2026-08-12'), 0::numeric,
  'a single QLD holiday is 0 in QLD');
select is(private.count_working_days('NSW', '2026-08-12', '2026-08-12'), 1::numeric,
  'the same day is 1 in NSW');
select is(private.count_working_days('QLD', '2026-08-15', '2026-08-15'), 0::numeric,
  'a single Saturday is 0');

-- Christmas: 9 weekdays from Mon 21 to Thu 31, minus Fri 25 and Mon 28.
select is(private.count_working_days('QLD', '2026-12-21', '2026-12-31'), 7::numeric,
  'QLD 21-31 Dec is 7 working days');

select is(private.count_working_days('QLD', '2026-08-14', '2026-08-10'), 0::numeric,
  'an end before the start counts 0');

select * from finish();
rollback;

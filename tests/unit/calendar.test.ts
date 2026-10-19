import { describe, expect, it } from "vitest";
import {
  clipSpan,
  currentMonth,
  groupByRegion,
  holidaysByRegionDate,
  monthDays,
  parseMonth,
  shiftMonth,
} from "../../src/lib/calendar";

describe("parseMonth", () => {
  it("accepts YYYY-MM", () => {
    expect(parseMonth("2026-09", "2026-01")).toBe("2026-09");
  });

  it("falls back for missing, malformed or impossible months", () => {
    for (const bad of [undefined, null, "", "2026-9", "2026-13", "2026-00", "26-09", "2026-09-01", "abc"]) {
      expect(parseMonth(bad, "2026-01")).toBe("2026-01");
    }
  });
});

describe("currentMonth", () => {
  it("uses the viewer's timezone, not the server's", () => {
    // 2026-09-30 20:00 UTC is already 1 October in Brisbane (UTC+10) and Hong Kong (UTC+8).
    const now = new Date("2026-09-30T20:00:00Z");
    expect(currentMonth("Australia/Brisbane", now)).toBe("2026-10");
    expect(currentMonth("Asia/Hong_Kong", now)).toBe("2026-10");
    expect(currentMonth("UTC", now)).toBe("2026-09");
  });
});

describe("monthDays", () => {
  it("returns the bounds and one entry per day", () => {
    const m = monthDays("2026-09");
    expect(m.from).toBe("2026-09-01");
    expect(m.to).toBe("2026-09-30");
    expect(m.days).toHaveLength(30);
    expect(m.days[0]).toMatchObject({ date: "2026-09-01", day: 1 });
    expect(m.days[29]).toMatchObject({ date: "2026-09-30", day: 30 });
  });

  it("handles 31-day months and leap years", () => {
    expect(monthDays("2026-10").days).toHaveLength(31);
    expect(monthDays("2028-02").days).toHaveLength(29);
    expect(monthDays("2026-02").days).toHaveLength(28);
  });

  it("numbers weekdays Monday = 0 and marks weekends", () => {
    const { days } = monthDays("2026-09"); // 1 Sep 2026 is a Tuesday
    expect(days[0].weekday).toBe(1);
    expect(days[0].isWeekend).toBe(false);
    expect(days[4]).toMatchObject({ date: "2026-09-05", weekday: 5, isWeekend: true }); // Saturday
    expect(days[5]).toMatchObject({ date: "2026-09-06", weekday: 6, isWeekend: true }); // Sunday
    expect(days[6]).toMatchObject({ date: "2026-09-07", weekday: 0, isWeekend: false }); // Monday
  });

  it("gives every day a short weekday label", () => {
    const { days } = monthDays("2026-09");
    expect(days[0].weekdayLabel).toBe("Tue");
    expect(days[5].weekdayLabel).toBe("Sun");
  });

  it("stays within the 62-day limit of team_calendar", () => {
    for (let m = 1; m <= 12; m++) {
      const month = `2026-${String(m).padStart(2, "0")}`;
      expect(monthDays(month).days.length).toBeLessThanOrEqual(62);
    }
  });
});

describe("shiftMonth", () => {
  it("moves to the previous and next month", () => {
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });

  it("crosses year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
});

describe("holidaysByRegionDate", () => {
  const rows = [
    { region_code: "QLD", holiday_date: "2026-10-05", name: "King's Birthday" },
    { region_code: "NSW", holiday_date: "2026-10-05", name: "Labour Day" },
    { region_code: "HK", holiday_date: "2026-10-01", name: "National Day" },
    { region_code: "HK", holiday_date: "2026-10-07", name: "Chung Yeung Festival" },
  ];

  it("maps each holiday to its region and date", () => {
    const map = holidaysByRegionDate(rows);
    expect(map.get("QLD")?.get("2026-10-05")).toBe("King's Birthday");
    expect(map.get("NSW")?.get("2026-10-05")).toBe("Labour Day");
    expect(map.get("HK")?.get("2026-10-01")).toBe("National Day");
    expect(map.get("HK")?.size).toBe(2);
  });

  it("keeps a QLD-only holiday out of the other regions", () => {
    const map = holidaysByRegionDate([rows[0]]);
    expect(map.get("QLD")?.has("2026-10-05")).toBe(true);
    expect(map.get("NSW")).toBeUndefined();
    expect(map.get("HK")).toBeUndefined();
  });
});

describe("groupByRegion", () => {
  const people = [
    { id: "3", full_name: "Zoe", region_code: "HK" },
    { id: "1", full_name: "Ann", region_code: "QLD" },
    { id: "2", full_name: "Bob", region_code: "NSW" },
    { id: "4", full_name: "Cal", region_code: "QLD" },
  ];

  it("groups people by region in the given region order, sorted by name", () => {
    const groups = groupByRegion(people, ["QLD", "NSW", "HK"]);
    expect(groups.map((g) => g.region)).toEqual(["QLD", "NSW", "HK"]);
    expect(groups[0].people.map((p) => p.full_name)).toEqual(["Ann", "Cal"]);
    expect(groups[2].people.map((p) => p.full_name)).toEqual(["Zoe"]);
  });

  it("keeps regions with nobody in them, so their holidays still show", () => {
    const groups = groupByRegion([people[1]], ["QLD", "NSW", "HK"]);
    expect(groups.map((g) => [g.region, g.people.length])).toEqual([
      ["QLD", 1],
      ["NSW", 0],
      ["HK", 0],
    ]);
  });

  it("appends people whose region is not in the list rather than dropping them", () => {
    const groups = groupByRegion(people, ["QLD"]);
    expect(groups.map((g) => g.region)).toEqual(["QLD", "HK", "NSW"]);
    expect(groups.flatMap((g) => g.people)).toHaveLength(4);
  });
});

describe("clipSpan", () => {
  const from = "2026-09-01";
  const to = "2026-09-30";

  it("returns a span inside the month unchanged", () => {
    expect(clipSpan("2026-09-07", "2026-09-08", from, to)).toEqual({ start: "2026-09-07", end: "2026-09-08" });
  });

  it("clips a span that starts before the month", () => {
    expect(clipSpan("2026-08-28", "2026-09-03", from, to)).toEqual({ start: "2026-09-01", end: "2026-09-03" });
  });

  it("clips a span that ends after the month", () => {
    expect(clipSpan("2026-09-28", "2026-10-02", from, to)).toEqual({ start: "2026-09-28", end: "2026-09-30" });
  });

  it("clips a span that covers the whole month", () => {
    expect(clipSpan("2026-08-01", "2026-10-31", from, to)).toEqual({ start: from, end: to });
  });

  it("keeps a span that touches only the first or last day", () => {
    expect(clipSpan("2026-08-30", "2026-09-01", from, to)).toEqual({ start: from, end: from });
    expect(clipSpan("2026-09-30", "2026-10-02", from, to)).toEqual({ start: to, end: to });
  });

  it("returns null for a span entirely outside the month", () => {
    expect(clipSpan("2026-08-01", "2026-08-31", from, to)).toBeNull();
    expect(clipSpan("2026-10-01", "2026-10-05", from, to)).toBeNull();
  });
});

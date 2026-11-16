import { describe, expect, it } from "vitest";
import { formatPlainDate, greeting, leaveYear, todayIn } from "../../src/lib/dates";

describe("formatPlainDate", () => {
  it("formats as ddd d MMM yyyy", () => {
    expect(formatPlainDate("2027-01-01")).toBe("Fri 1 Jan 2027");
    expect(formatPlainDate("2026-12-25")).toBe("Fri 25 Dec 2026");
  });

  it("does not shift the day in any process timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
        process.env.TZ = tz;
        expect(formatPlainDate("2027-03-01")).toBe("Mon 1 Mar 2027");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("rejects malformed input", () => {
    expect(() => formatPlainDate("1/2/2027")).toThrow();
  });
});

describe("todayIn", () => {
  // 2026-12-31T17:00Z = 01:00 on 1 Jan in Hong Kong (UTC+8), 03:00 in Brisbane (UTC+10)
  // 2026-12-31T15:00Z = 23:00 on 31 Dec in Hong Kong, 01:00 on 1 Jan in Brisbane
  it("returns the local calendar date for the timezone", () => {
    const instant = new Date("2026-12-31T15:00:00Z");
    expect(todayIn("Asia/Hong_Kong", instant)).toBe("2026-12-31");
    expect(todayIn("Australia/Brisbane", instant)).toBe("2027-01-01");
  });
});

describe("leaveYear", () => {
  it("is the calendar year in the given timezone", () => {
    const instant = new Date("2026-12-31T15:00:00Z");
    expect(leaveYear("Asia/Hong_Kong", instant)).toBe(2026);
    expect(leaveYear("Australia/Brisbane", instant)).toBe(2027);
  });
});

describe("greeting", () => {
  const at = (iso: string) => new Date(iso);

  it("says good morning before 12:00", () => {
    expect(greeting(at("2026-10-20T00:00:00Z"), "UTC", "Sam Smith")).toBe("Good morning, Sam");
    expect(greeting(at("2026-10-20T11:59:00Z"), "UTC", "Sam Smith")).toBe("Good morning, Sam");
  });

  it("says good afternoon from 12:00 to 17:59", () => {
    expect(greeting(at("2026-10-20T12:00:00Z"), "UTC", "Sam Smith")).toBe("Good afternoon, Sam");
    expect(greeting(at("2026-10-20T17:59:00Z"), "UTC", "Sam Smith")).toBe("Good afternoon, Sam");
  });

  it("says good evening from 18:00 onwards", () => {
    expect(greeting(at("2026-10-20T18:00:00Z"), "UTC", "Sam Smith")).toBe("Good evening, Sam");
    expect(greeting(at("2026-10-20T23:59:00Z"), "UTC", "Sam Smith")).toBe("Good evening, Sam");
  });

  it("uses the viewer's timezone", () => {
    // 23:00 UTC is 09:00 the next day in Brisbane (UTC+10)
    expect(greeting(at("2026-10-20T23:00:00Z"), "Australia/Brisbane", "Sam")).toBe("Good morning, Sam");
  });

  it("handles a single-word name", () => {
    expect(greeting(at("2026-10-20T09:00:00Z"), "UTC", "Cher")).toBe("Good morning, Cher");
  });
});

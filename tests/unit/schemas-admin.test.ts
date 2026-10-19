import { describe, expect, it } from "vitest";
import {
  deleteHolidaySchema,
  holidaySchema,
  leaveTypeSchema,
  loadDemoSchema,
  regionSchema,
  setAllowanceSchema,
  updateUserSchema,
} from "../../src/lib/schemas";

const uuid = "4b0b7d0e-3c1a-4d2e-9f5a-1b2c3d4e5f60";

describe("updateUserSchema", () => {
  const valid = { id: uuid, full_name: "Sam Lee", role: "manager", region_code: "NSW" };
  it("accepts a name, role and region", () => {
    expect(updateUserSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an empty name, an unknown role and a malformed region", () => {
    expect(updateUserSchema.safeParse({ ...valid, full_name: "  " }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...valid, role: "owner" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...valid, region_code: "nsw" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...valid, id: "nope" }).success).toBe(false);
  });
});

describe("loadDemoSchema", () => {
  it("needs a password of at least 10 characters", () => {
    expect(loadDemoSchema.safeParse({ password: "0123456789" }).success).toBe(true);
    expect(loadDemoSchema.safeParse({ password: "012345678" }).success).toBe(false);
    expect(loadDemoSchema.safeParse({}).success).toBe(false);
  });
});

describe("setAllowanceSchema", () => {
  const valid = { user_id: uuid, leave_type_id: uuid, year: 2026, days: 22.5, reason: "Long service" };
  it("accepts days in half-day steps, or null to remove the override", () => {
    expect(setAllowanceSchema.safeParse(valid).success).toBe(true);
    expect(setAllowanceSchema.safeParse({ ...valid, days: null }).success).toBe(true);
    expect(setAllowanceSchema.safeParse({ ...valid, reason: undefined }).success).toBe(true);
  });
  it("rejects negative or odd fractions of days, a silly year and a long reason", () => {
    expect(setAllowanceSchema.safeParse({ ...valid, days: -1 }).success).toBe(false);
    expect(setAllowanceSchema.safeParse({ ...valid, days: 1.25 }).success).toBe(false);
    expect(setAllowanceSchema.safeParse({ ...valid, days: 400 }).success).toBe(false);
    expect(setAllowanceSchema.safeParse({ ...valid, year: 1999 }).success).toBe(false);
    expect(setAllowanceSchema.safeParse({ ...valid, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("leaveTypeSchema", () => {
  const capped = { name: "Study", is_capped: true, default_allowance: 5, is_active: true, sort_order: 4 };
  it("accepts a new capped type and an uncapped type with no default", () => {
    expect(leaveTypeSchema.safeParse(capped).success).toBe(true);
    expect(leaveTypeSchema.safeParse({ ...capped, is_capped: false, default_allowance: null }).success).toBe(true);
    expect(leaveTypeSchema.safeParse({ ...capped, id: uuid, is_active: false }).success).toBe(true);
  });
  it("needs a default exactly when the type is capped", () => {
    expect(leaveTypeSchema.safeParse({ ...capped, default_allowance: null }).success).toBe(false);
    expect(leaveTypeSchema.safeParse({ ...capped, is_capped: false }).success).toBe(false);
  });
  it("rejects an empty or long name", () => {
    expect(leaveTypeSchema.safeParse({ ...capped, name: " " }).success).toBe(false);
    expect(leaveTypeSchema.safeParse({ ...capped, name: "x".repeat(51) }).success).toBe(false);
  });
});

describe("regionSchema", () => {
  const valid = { code: "VIC", name: "Victoria (Melbourne)", default_timezone: "Australia/Melbourne" };
  it("accepts a 2–5 letter upper-case code and an IANA timezone", () => {
    expect(regionSchema.safeParse(valid).success).toBe(true);
    expect(regionSchema.safeParse({ ...valid, code: "HK" }).success).toBe(true);
  });
  it("rejects a bad code, an empty name or an unknown timezone", () => {
    for (const code of ["V", "vic", "VICTORIA", "V1C"]) {
      expect(regionSchema.safeParse({ ...valid, code }).success, code).toBe(false);
    }
    expect(regionSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(regionSchema.safeParse({ ...valid, default_timezone: "Melbourne" }).success).toBe(false);
  });
});

describe("holidaySchema", () => {
  const valid = { region_code: "QLD", holiday_date: "2026-12-25", name: "Christmas Day" };
  it("accepts a new holiday, or an edit with its id", () => {
    expect(holidaySchema.safeParse(valid).success).toBe(true);
    expect(holidaySchema.safeParse({ ...valid, id: uuid }).success).toBe(true);
  });
  it("rejects a bad date, an empty or 81-character name and a bad region", () => {
    expect(holidaySchema.safeParse({ ...valid, holiday_date: "25/12/2026" }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...valid, region_code: "q" }).success).toBe(false);
  });
  it("deleteHolidaySchema needs an id", () => {
    expect(deleteHolidaySchema.safeParse({ id: uuid }).success).toBe(true);
    expect(deleteHolidaySchema.safeParse({ id: "1" }).success).toBe(false);
  });
});

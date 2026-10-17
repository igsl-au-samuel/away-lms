import { describe, expect, it } from "vitest";
import { profileSchema } from "../../src/lib/schemas";

const valid = { region_code: "QLD", timezone: "Australia/Brisbane" };

describe("profileSchema", () => {
  it("accepts a region code and an IANA timezone", () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
    expect(profileSchema.safeParse({ region_code: "HK", timezone: "Asia/Hong_Kong" }).success).toBe(true);
  });

  it("accepts every timezone the runtime supports", () => {
    for (const timezone of Intl.supportedValuesOf("timeZone")) {
      expect(profileSchema.safeParse({ ...valid, timezone }).success, timezone).toBe(true);
    }
  });

  it("rejects an invalid or empty timezone", () => {
    for (const bad of ["Mars/Olympus", "", "Brisbane", "UTC+10", undefined]) {
      expect(profileSchema.safeParse({ ...valid, timezone: bad }).success, String(bad)).toBe(false);
    }
  });

  it("rejects a missing or malformed region code", () => {
    for (const bad of ["", "qld", "Queensland", "Q", undefined]) {
      expect(profileSchema.safeParse({ ...valid, region_code: bad }).success, String(bad)).toBe(false);
    }
  });
});

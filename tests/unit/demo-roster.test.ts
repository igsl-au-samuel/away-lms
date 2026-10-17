import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_EMAIL_DOMAIN, DEMO_EMPLOYEES, DEMO_REQUESTS } from "../../src/server/demo/roster";

describe("demo roster", () => {
  it("uses a reserved fictional email domain for every demo employee (FR-029)", () => {
    expect(DEMO_EMAIL_DOMAIN).toMatch(/\.(example|test|invalid)$/);
    for (const e of DEMO_EMPLOYEES) {
      expect(e.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
      expect(e.email).toBe(e.email.toLowerCase());
    }
  });

  it("has unique emails and names", () => {
    expect(new Set(DEMO_EMPLOYEES.map((e) => e.email)).size).toBe(DEMO_EMPLOYEES.length);
    expect(new Set(DEMO_EMPLOYEES.map((e) => e.full_name)).size).toBe(DEMO_EMPLOYEES.length);
  });

  it("has employees only: the roster has no role field to set (FR-032)", () => {
    for (const e of DEMO_EMPLOYEES) expect(e).not.toHaveProperty("role");
  });

  it("spreads employees across QLD, NSW and HK with matching timezones", () => {
    const regions = new Set(DEMO_EMPLOYEES.map((e) => e.region_code));
    expect(regions).toEqual(new Set(["QLD", "NSW", "HK"]));
    const tz = { QLD: "Australia/Brisbane", NSW: "Australia/Sydney", HK: "Asia/Hong_Kong" };
    for (const e of DEMO_EMPLOYEES) expect(e.timezone).toBe(tz[e.region_code]);
  });

  it("has requests in every status", () => {
    expect(new Set(DEMO_REQUESTS.map((r) => r.status))).toEqual(new Set(["pending", "approved", "declined"]));
  });

  it("gives every request a known employee and a Monday-to-Friday span", () => {
    const emails = new Set(DEMO_EMPLOYEES.map((e) => e.email));
    for (const r of DEMO_REQUESTS) {
      expect(emails.has(r.email)).toBe(true);
      expect(r.weekday).toBeGreaterThanOrEqual(1);
      expect(r.workdays).toBeGreaterThanOrEqual(1);
      expect(r.weekday + r.workdays - 1).toBeLessThanOrEqual(5);
    }
  });

  it("never gives one employee two requests in the same week (no overlaps)", () => {
    const weeks = DEMO_REQUESTS.map((r) => `${r.email}/${r.weekOffset}`);
    expect(new Set(weeks).size).toBe(weeks.length);
  });

  it("has no password literal anywhere in the module (FR-031)", () => {
    const source = readFileSync(new URL("../../src/server/demo/roster.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/password|passwd|secret/i);
  });
});

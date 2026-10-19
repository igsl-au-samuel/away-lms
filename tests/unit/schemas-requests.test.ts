import { describe, expect, it } from "vitest";
import { leaveRequestSchema } from "../../src/lib/schemas";

const valid = {
  leave_type_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  start_date: "2026-08-10",
  end_date: "2026-08-14",
};

describe("leaveRequestSchema", () => {
  it("accepts a type, ISO dates and no note", () => {
    expect(leaveRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a note", () => {
    expect(leaveRequestSchema.safeParse({ ...valid, note: "Ekka week" }).success).toBe(true);
  });

  it("rejects dates that are not valid ISO dates", () => {
    for (const bad of ["2026-02-30", "12/08/2026", "2026-8-10", "", "2026-08-10T00:00:00Z"]) {
      expect(leaveRequestSchema.safeParse({ ...valid, start_date: bad }).success, bad).toBe(false);
      expect(leaveRequestSchema.safeParse({ ...valid, end_date: bad }).success, bad).toBe(false);
    }
  });

  it("requires both dates", () => {
    expect(leaveRequestSchema.safeParse({ leave_type_id: valid.leave_type_id, start_date: "2026-08-10" }).success).toBe(
      false,
    );
  });

  it("allows a note of 500 characters but not 501", () => {
    expect(leaveRequestSchema.safeParse({ ...valid, note: "x".repeat(500) }).success).toBe(true);
    expect(leaveRequestSchema.safeParse({ ...valid, note: "x".repeat(501) }).success).toBe(false);
  });

  it("requires the type id to be a uuid", () => {
    expect(leaveRequestSchema.safeParse({ ...valid, leave_type_id: "annual" }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ ...valid, leave_type_id: undefined }).success).toBe(false);
  });
});

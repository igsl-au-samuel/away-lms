import { describe, expect, it } from "vitest";
import { decideLeaveRequestSchema } from "../../src/lib/schemas";

const valid = { id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", outcome: "approved" as const };

describe("decideLeaveRequestSchema", () => {
  it("accepts approved and declined, with or without a comment", () => {
    expect(decideLeaveRequestSchema.safeParse(valid).success).toBe(true);
    expect(decideLeaveRequestSchema.safeParse({ ...valid, outcome: "declined", comment: "Team is short" }).success).toBe(
      true,
    );
  });

  it("rejects pending and unknown outcomes", () => {
    for (const bad of ["pending", "cancelled", "", undefined]) {
      expect(decideLeaveRequestSchema.safeParse({ ...valid, outcome: bad }).success, String(bad)).toBe(false);
    }
  });

  it("requires the request id to be a uuid", () => {
    expect(decideLeaveRequestSchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
    expect(decideLeaveRequestSchema.safeParse({ outcome: "approved" }).success).toBe(false);
  });

  it("allows a comment of 500 characters but not 501", () => {
    expect(decideLeaveRequestSchema.safeParse({ ...valid, comment: "x".repeat(500) }).success).toBe(true);
    expect(decideLeaveRequestSchema.safeParse({ ...valid, comment: "x".repeat(501) }).success).toBe(false);
  });

  it("trims the comment", () => {
    const parsed = decideLeaveRequestSchema.parse({ ...valid, comment: "  ok  " });
    expect(parsed.comment).toBe("ok");
  });
});

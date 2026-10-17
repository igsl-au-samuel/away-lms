import { describe, expect, it } from "vitest";
import { passwordResetSchema, setPasswordSchema, signInSchema } from "../../src/lib/schemas";

describe("signInSchema", () => {
  it("accepts an email and a password", () => {
    expect(signInSchema.safeParse({ email: "a@away.test", password: "x" }).success).toBe(true);
  });
  it("rejects a bad or missing email", () => {
    expect(signInSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(signInSchema.safeParse({ password: "x" }).success).toBe(false);
  });
  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "a@away.test", password: "" }).success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("accepts 10 characters", () => {
    expect(setPasswordSchema.safeParse({ password: "1234567890" }).success).toBe(true);
  });
  it("rejects 9 characters", () => {
    expect(setPasswordSchema.safeParse({ password: "123456789" }).success).toBe(false);
  });
});

describe("passwordResetSchema", () => {
  it("takes an email only", () => {
    expect(passwordResetSchema.safeParse({ email: "a@away.test" }).success).toBe(true);
    expect(passwordResetSchema.safeParse({ email: "" }).success).toBe(false);
    expect(passwordResetSchema.safeParse({}).success).toBe(false);
  });
});

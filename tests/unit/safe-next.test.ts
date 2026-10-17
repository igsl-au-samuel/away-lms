import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/set-password")).toBe("/set-password");
  });
  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "set-password"])(
    "falls back to / for %s",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );
});

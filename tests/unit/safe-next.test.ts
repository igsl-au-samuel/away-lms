import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/set-password")).toBe("/set-password");
  });
  it("keeps the query string and hash", () => {
    expect(safeNext("/requests/new?x=1#top")).toBe("/requests/new?x=1#top");
  });
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example"])(
    "rejects control characters that browsers strip (%j)",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );
  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "set-password"])(
    "falls back to / for %s",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );
});

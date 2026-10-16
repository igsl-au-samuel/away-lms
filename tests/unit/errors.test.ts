import { describe, expect, it } from "vitest";
import { ERROR_COPY, GENERIC_ERROR, toActionResult } from "../../src/lib/errors";

describe("toActionResult", () => {
  it("wraps success as { ok: true, data }", () => {
    expect(toActionResult({ data: { id: 1 }, error: null })).toEqual({
      ok: true,
      data: { id: 1 },
    });
  });

  it.each(Object.keys(ERROR_COPY))("maps %s to its copy", (code) => {
    const result = toActionResult({
      data: null,
      error: { message: code, details: "plain English" },
    });
    expect(result).toEqual({
      ok: false,
      code,
      message: ERROR_COPY[code as keyof typeof ERROR_COPY],
    });
  });

  it("seeds the Phase 2 codes", () => {
    for (const code of [
      "not_allowed",
      "not_found",
      "profile_exists",
      "cannot_change_own_role",
      "cannot_deactivate_self",
      "demo_must_be_employee",
    ]) {
      expect(ERROR_COPY).toHaveProperty(code);
    }
  });

  it("gives the generic message for unknown codes", () => {
    expect(
      toActionResult({ data: null, error: { message: "boom: connection reset" } }),
    ).toEqual({ ok: false, code: "unknown", message: GENERIC_ERROR });
  });
});

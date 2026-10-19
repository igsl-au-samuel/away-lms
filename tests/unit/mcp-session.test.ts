import { describe, expect, it } from "vitest";
import { readEnv } from "../../mcp/src/session";
import { isPrivilegedKey } from "../../src/server/mcp/session";
import { fail, resolveLeaveType } from "../../src/server/mcp/tools";

const jwt = (payload: object) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

const valid = {
  LMS_SUPABASE_URL: "http://127.0.0.1:54321",
  LMS_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  LMS_EMAIL: "eden@away.test",
  LMS_PASSWORD: "pw",
};

describe("readEnv", () => {
  it("accepts a complete environment", () => {
    expect(readEnv(valid)).toEqual(valid);
  });

  it("names every missing variable", () => {
    expect(() => readEnv({ LMS_SUPABASE_URL: valid.LMS_SUPABASE_URL })).toThrow(
      /LMS_SUPABASE_PUBLISHABLE_KEY, LMS_EMAIL, LMS_PASSWORD/,
    );
  });

  it("refuses to start when SUPABASE_SECRET_KEY is set", () => {
    expect(() => readEnv({ ...valid, SUPABASE_SECRET_KEY: "sb_secret_x" })).toThrow(/never uses the secret key/);
  });

  it("refuses a secret key passed as the publishable key", () => {
    expect(() => readEnv({ ...valid, LMS_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" })).toThrow(/is a secret key/);
  });
});

describe("isPrivilegedKey", () => {
  it("flags secret keys and service_role JWTs", () => {
    expect(isPrivilegedKey("sb_secret_abc")).toBe(true);
    expect(isPrivilegedKey(jwt({ role: "service_role" }))).toBe(true);
  });

  it("passes publishable keys and anon JWTs", () => {
    expect(isPrivilegedKey("sb_publishable_abc")).toBe(false);
    expect(isPrivilegedKey(jwt({ role: "anon" }))).toBe(false);
    expect(isPrivilegedKey("a.b.c")).toBe(false);
  });
});

describe("resolveLeaveType", () => {
  const types = [
    { id: "1", name: "Annual" },
    { id: "2", name: "Sick" },
  ];

  it("matches names case-insensitively, ignoring spaces at the ends", () => {
    expect(resolveLeaveType(types, "  annual ")?.id).toBe("1");
  });

  it("returns null for an unknown name", () => {
    expect(resolveLeaveType(types, "Holiday")).toBeNull();
  });
});

describe("fail", () => {
  it("uses the app's copy for known codes", () => {
    const res = fail("own_request");
    expect(res.isError).toBe(true);
    expect(res.content[0]).toEqual({
      type: "text",
      text: "You can't approve or decline your own request. (own_request)",
    });
  });

  it("puts the message in structuredContent too", () => {
    expect(fail("not_found", "Choose one of: Annual.").structuredContent).toEqual({
      error: "not_found",
      message: "We couldn't find that. Choose one of: Annual. (not_found)",
    });
  });

  it("falls back to the generic message for unknown codes", () => {
    expect(fail("boom").content[0]).toMatchObject({ text: expect.stringMatching(/^Something went wrong/) });
  });
});

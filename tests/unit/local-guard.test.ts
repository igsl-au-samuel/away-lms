import { describe, expect, it } from "vitest";
import { isLocalSupabaseUrl } from "../../scripts/lib/local-guard";

describe("isLocalSupabaseUrl", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://localhost"])(
    "accepts %s",
    (url) => expect(isLocalSupabaseUrl(url)).toBe(true),
  );

  it.each([
    "https://abcdefgh.supabase.co",
    "https://localhost.supabase.co",
    "http://127.0.0.1.evil.com",
    "https://example.com",
    "",
    "not a url",
    undefined,
  ])("rejects %s", (url) => expect(isLocalSupabaseUrl(url)).toBe(false));
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword } }),
}));

const { signIn } = await import("../../src/actions/auth");

const creds = { email: "eden@away.test", password: "pw" };
const CONSENT = "/oauth/consent?authorization_id=abc-123";

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ error: null });
});

describe("signIn next", () => {
  it("lands on / by default", async () => {
    await expect(signIn(creds)).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("returns to the consent page it was sent from", async () => {
    await expect(signIn(creds, CONSENT)).rejects.toThrow(`NEXT_REDIRECT:${CONSENT}`);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example"])(
    "falls back to / for %j",
    async (next) => {
      await expect(signIn(creds, next)).rejects.toThrow("NEXT_REDIRECT:/");
    },
  );

  it("does not redirect on a bad password", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "nope" } });
    const res = await signIn(creds, CONSENT);
    expect(res).toMatchObject({ ok: false, code: "invalid_credentials" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

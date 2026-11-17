import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const getViewer = vi.fn();
const updateUser = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, updateUser } }),
}));
// The action now asks the server layer whether the signed-in account still has a profile (#375).
vi.mock("../../src/server/auth", () => ({ getViewer }));

const { setPassword, signIn } = await import("../../src/actions/auth");

const creds = { email: "eden@away.test", password: "pw" };
const CONSENT = "/oauth/consent?authorization_id=abc-123";

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ error: null });
  getViewer.mockResolvedValue({ id: "someone" });
  updateUser.mockResolvedValue({ error: null });
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

describe("setPassword (#375)", () => {
  const pw = { password: "at-least-ten-chars" };

  it("rotates the password for an account that still has a profile", async () => {
    await expect(setPassword(pw)).resolves.toMatchObject({ ok: true });
    expect(updateUser).toHaveBeenCalled();
  });

  it("refuses an account with no viewer and never reaches Auth", async () => {
    getViewer.mockResolvedValue(null);
    await expect(setPassword(pw)).resolves.toMatchObject({ ok: false, code: "unknown" });
    expect(updateUser).not.toHaveBeenCalled();
  });
});

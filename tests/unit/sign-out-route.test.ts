import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}));

const { GET, POST } = await import("../../src/app/auth/sign-out/route");

const request = (origin?: string) =>
  new NextRequest("https://away.example/auth/sign-out", {
    method: "POST",
    headers: origin === undefined ? {} : { origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
});

describe("GET /auth/sign-out", () => {
  it("refuses without ending the session", async () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("POST /auth/sign-out", () => {
  it("ends the session for a same-origin request", async () => {
    const res = await POST(request("https://away.example"));
    expect(signOut).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://away.example/sign-in");
  });

  it.each([["https://evil.example"], ["null"], [""]])("rejects %j without ending the session", async (origin) => {
    const res = await POST(request(origin));
    expect(res.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects a request with no origin header", async () => {
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();
const getUser = vi.fn();
const getViewer = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, oauth: { approveAuthorization, denyAuthorization } },
  }),
}));
vi.mock("../../src/server/auth", () => ({ getViewer: (...args: unknown[]) => getViewer(...args) }));

const { decideAuthorization } = await import("../../src/actions/oauth");

const ID = "auth-123";
const CLIENT_URL = "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  getViewer.mockResolvedValue({ id: "u1", is_active: true });
  approveAuthorization.mockResolvedValue({ data: { redirect_url: CLIENT_URL }, error: null });
  denyAuthorization.mockResolvedValue({
    data: { redirect_url: "https://claude.ai/api/mcp/auth_callback?error=access_denied" },
    error: null,
  });
});

describe("decideAuthorization", () => {
  it.each(["approve", "deny"] as const)("refuses %s without a session", async (decision) => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await decideAuthorization({ authorizationId: ID, decision });
    expect(res).toMatchObject({ ok: false, code: "not_allowed" });
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(denyAuthorization).not.toHaveBeenCalled();
  });

  it("refuses to approve for an inactive profile", async () => {
    getViewer.mockResolvedValue(null);
    const res = await decideAuthorization({ authorizationId: ID, decision: "approve" });
    expect(res).toMatchObject({ ok: false, code: "account_not_active" });
    expect(approveAuthorization).not.toHaveBeenCalled();
  });

  it("lets an inactive profile deny", async () => {
    getViewer.mockResolvedValue(null);
    await expect(decideAuthorization({ authorizationId: ID, decision: "deny" })).rejects.toThrow(/NEXT_REDIRECT.*access_denied/);
    expect(denyAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
  });

  it("approves and redirects to the URL Supabase returns", async () => {
    await expect(decideAuthorization({ authorizationId: ID, decision: "approve" })).rejects.toThrow(`NEXT_REDIRECT:${CLIENT_URL}`);
    expect(approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
  });

  it("returns friendly copy, not Supabase's message, when the authorization is bad", async () => {
    approveAuthorization.mockResolvedValue({ data: null, error: { message: "authorization request cannot be processed: expired" } });
    const res = await decideAuthorization({ authorizationId: ID, decision: "approve" });
    expect(res).toMatchObject({ ok: false, code: "authorization_invalid" });
    expect(JSON.stringify(res)).not.toContain("cannot be processed");
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { authorizationId: "", decision: "approve" },
    { authorizationId: ID, decision: "maybe" },
    { authorizationId: 7, decision: "deny" },
  ])("rejects malformed input %j", async (input) => {
    const res = await decideAuthorization(input);
    expect(res).toMatchObject({ ok: false, code: "authorization_invalid" });
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(denyAuthorization).not.toHaveBeenCalled();
  });
});

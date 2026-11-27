import { beforeEach, describe, expect, it, vi } from "vitest";

const adminClients = vi.fn();
const loadDemo = vi.fn();
const revalidatePath = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("../../src/server/admin-action", () => ({
  adminClients,
  notAllowed: () => ({ ok: false, code: "not_allowed", message: "You don't have permission to do that." }),
  invalid: (message?: string) => ({ ok: false, code: "invalid_input", message: message ?? "invalid" }),
}));
// The action is what changes; the loader stays real so `demoLoadStage` and
// `demoLoadTookOldRoster` are the committed ones.
vi.mock("../../src/server/demo/loader", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/server/demo/loader")>();
  return { ...real, loadDemo: (...args: unknown[]) => loadDemo(...args) };
});

const { loadDemo: action } = await import("../../src/actions/demo");
const { DemoLoadError } = await import("../../src/server/demo/loader");
const { GENERIC_ERROR } = await import("../../src/lib/errors");

const PASSWORD = "demo-password-long-enough";
const CLIENTS = { admin: {}, user: {} };

beforeEach(() => {
  vi.clearAllMocks();
  adminClients.mockResolvedValue(CLIENTS);
  loadDemo.mockResolvedValue({ users: 6, requests: 12 });
});

describe("the demo load action tells the admin what actually happened (#448)", () => {
  it("reports a load that finished and re-renders the page", async () => {
    const res = await action({ password: PASSWORD });
    expect(res).toEqual({ ok: true, data: { users: 6, requests: 12 } });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("tells the admin the demo is incomplete when the failure came after the old roster was deleted", async () => {
    // "request submit" is past `removeDemo`: the previous demo is already gone, so "please try
    // again" without telling the admin that is the unsafe message #448 described.
    loadDemo.mockRejectedValue(new DemoLoadError("request submit", "Demo request failed: no_working_days"));
    const res = await action({ password: PASSWORD });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("demo_incomplete");
    expect(res.message).not.toBe(GENERIC_ERROR);
    expect(res.message).toMatch(/incomplete/i);
    expect(res.message).toMatch(/again/i);
    // The page still lists the roster that was deleted unless it is re-rendered.
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic message when nothing had been deleted yet", async () => {
    loadDemo.mockRejectedValue(new DemoLoadError("profile lookup", "Demo profile lookup failed: boom"));
    const res = await action({ password: PASSWORD });

    expect(res).toEqual({ ok: false, code: "unknown", message: GENERIC_ERROR });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an unrecognised error as possibly destructive, because it could have fired mid-delete", async () => {
    loadDemo.mockRejectedValue(new TypeError("fetch failed"));
    const res = await action({ password: PASSWORD });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("demo_incomplete");
  });

  it("refuses a short password without calling the loader", async () => {
    const res = await action({ password: "short" });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it("refuses a caller who isn't an admin without calling the loader", async () => {
    adminClients.mockResolvedValue(null);
    const res = await action({ password: PASSWORD });
    expect(res).toMatchObject({ ok: false, code: "not_allowed" });
    expect(loadDemo).not.toHaveBeenCalled();
  });
});
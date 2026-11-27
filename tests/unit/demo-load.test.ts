import { describe, expect, it, vi } from "vitest";

// loader.ts imports "server-only", which throws outside a React Server module graph. The unit
// config has no alias for it (vitest.integration.config.ts does), so it is stubbed here rather
// than widening a config all four sessions share for the sake of one file.
vi.mock("server-only", () => ({}));

import { DemoLoadError, DEMO_LOAD_STAGES, demoLoadStage, demoLoadTookOldRoster, loadDemo, removeDemo } from "../../src/server/demo/loader";
import { DEMO_EMAIL_DOMAIN, DEMO_EMPLOYEES, DEMO_REQUESTS } from "../../src/server/demo/roster";

const PASSWORD = "demo-password-long-enough";
const EMPLOYEES = DEMO_EMPLOYEES.length;
const REQUESTS = DEMO_REQUESTS.length;
const DECIDED = DEMO_REQUESTS.filter((r) => r.status !== "pending").length;

/** Workers Free allows 50 subrequests per invocation — Cloudflare's platform limits table. */
const SUBREQUEST_BUDGET = 50;
/** `adminClients()` asks for the user and then for whoami(), before the loader runs at all. */
const GUARD_CALLS = 2;
/** Two lookups, one listUsers, one leave-type read, one batched profile insert, plus the roster. */
const FRESH_LOAD = 4 + 2 * EMPLOYEES + REQUESTS + DECIDED;

type Reply = { data?: unknown; error?: { message: string } | null };

/** The nth call of a name, so one test can fail every submit but the fourth. */
type Failing = (call: string, nth: number) => string | null;

/**
 * A chainable, awaitable stand-in for one PostgREST request: `from(t).select(c).eq(...)` counts as
 * the single subrequest it is, because the count is what these tests measure.
 */
class Query {
  private op = "";
  private readonly mods: string[] = [];

  constructor(
    private readonly calls: string[],
    private readonly table: string,
    private readonly answer: (call: string) => Reply,
  ) {}

  select = () => this.step("select");
  insert = () => this.step("insert");
  eq = () => this.modify("eq");
  in = () => this.modify("in");
  order = () => this.modify("order");

  private step(op: string) {
    if (!this.op) this.op = op;
    return this;
  }

  private modify(mod: string) {
    this.mods.push(mod);
    return this;
  }

  then(onfulfilled?: ((value: Reply) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
    const call = `${this.table}.${this.op}${this.mods.length ? `.${this.mods.join("")}` : ""}`;
    this.calls.push(call);
    return Promise.resolve(this.answer(call)).then(onfulfilled, onrejected);
  }
}

function harness(
  opts: {
    /** Demo profiles that already exist, as they do on a reset. */
    existing?: string[];
    /** Demo-domain auth users left without a profile by an interrupted load. */
    orphans?: string[];
    /** What `leave_types` answers, so one test can hand back a set with nothing active in it. */
    leaveTypes?: unknown[];
    fail?: Failing;
  } = {},
) {
  const calls: string[] = [];
  const seen = new Map<string, number>();
  let issued = 0;

  const answer = (call: string): Reply => {
    const nth = (seen.get(call) ?? 0) + 1;
    seen.set(call, nth);
    const message = opts.fail?.(call, nth);
    if (message) return { error: { message } };
    switch (call) {
      case "profiles.select.eq":
        return { data: (opts.existing ?? []).map((id) => ({ id })) };
      case "profiles.select.in":
        return { data: [] };
      case "leave_types.select.order":
        return {
          data: opts.leaveTypes ?? ["Annual", "Personal/Sick", "Unpaid"].map((name, i) => ({ id: `t${i}`, name, is_active: true, sort_order: i })),
        };
      case "auth.admin.listUsers":
        return { data: { users: (opts.orphans ?? []).map((id) => ({ id, email: `left-over@${DEMO_EMAIL_DOMAIN}` })) } };
      case "auth.admin.createUser":
        return { data: { user: { id: `new-${++issued}` } } };
      case "auth.signInWithPassword":
        return { data: {} };
      case "rpc.submit_leave_request":
        return { data: { id: `req-${++issued}` } };
      default:
        return { data: null };
    }
  };

  const client = () => ({
    from: (table: string) => new Query(calls, table, answer),
    rpc: async (fn: string) => record(`rpc.${fn}`),
    auth: {
      signInWithPassword: async () => record("auth.signInWithPassword"),
      admin: {
        listUsers: async () => record("auth.admin.listUsers"),
        deleteUser: async () => record("auth.admin.deleteUser"),
        createUser: async () => record("auth.admin.createUser"),
      },
    },
  });
  const record = (call: string): Reply => {
    calls.push(call);
    return answer(call);
  };

  // One shape serves all three clients: which client asked never changes what is answered here.
  return { calls, admin: client(), decider: client(), newUserClient: client };
}

const load = (h: ReturnType<typeof harness>) =>
  loadDemo({ admin: h.admin as never, decider: h.decider as never, password: PASSWORD, newUserClient: h.newUserClient as never });

const stageOf = (h: ReturnType<typeof harness>) => load(h).then(() => "resolved", demoLoadStage);

describe("demo load: what it costs the subrequest budget (#214)", () => {
  it("makes one call per roster row on a fresh load, and no more", async () => {
    const h = harness();
    expect(await load(h)).toEqual({ users: EMPLOYEES, requests: REQUESTS });
    expect(h.calls).toHaveLength(FRESH_LOAD);
    // All twelve profiles land in one insert; that is the only batching the roster gets.
    expect(h.calls.filter((c) => c === "profiles.insert")).toHaveLength(1);
    expect(h.calls.filter((c) => c === "profiles.select.eq")).toHaveLength(1);
  });

  it("spends one more call for every demo user a reset deletes first", async () => {
    const h = harness({ existing: DEMO_EMPLOYEES.map((_, i) => `old-${i}`) });
    await load(h);
    expect(h.calls).toHaveLength(FRESH_LOAD + EMPLOYEES);
    // Measured 2026-11-17: a fresh load is 36, a reset 42, and the admin guard that runs before
    // either is 2 more — 44 of the 50 a free Worker is allowed, so six spare on the busiest case
    // that is not a retry. That margin is what the test below spends.
    expect(FRESH_LOAD + EMPLOYEES + GUARD_CALLS).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
  });

  it("spends one more call per no_working_days retry, which is what breaks the budget", async () => {
    // Three failed weeks then success for every request: the worst the loader's own retry loop allows.
    const h = harness({ fail: (call, nth) => (call === "rpc.submit_leave_request" && nth % 4 !== 0 ? "no_working_days" : null) });
    expect(await load(h)).toEqual({ users: EMPLOYEES, requests: REQUESTS });
    expect(h.calls.filter((c) => c === "rpc.submit_leave_request")).toHaveLength(REQUESTS * 4);
    expect(h.calls).toHaveLength(FRESH_LOAD + 3 * REQUESTS);
    expect(FRESH_LOAD + 3 * REQUESTS + GUARD_CALLS).toBeGreaterThan(SUBREQUEST_BUDGET);
  });
});

describe("demo load: the order it happens in (#214)", () => {
  it("deletes the whole previous roster before it creates the first new user", async () => {
    const h = harness({ existing: ["old-1", "old-2"] });
    await load(h);
    const firstCreate = h.calls.indexOf("auth.admin.createUser");
    const lastDelete = h.calls.lastIndexOf("auth.admin.deleteUser");
    expect(lastDelete).toBeGreaterThan(-1);
    // Pinned on purpose: the reset is destructive before it is constructive, so a load that fails
    // after this point has already taken the old demo away. A reorder has to argue with #214.
    expect(lastDelete).toBeLessThan(firstCreate);
    expect(h.calls.slice(0, firstCreate)).toEqual([
      "profiles.select.eq",
      "auth.admin.listUsers",
      "auth.admin.deleteUser",
      "auth.admin.deleteUser",
      "leave_types.select.order",
    ]);
  });

  it("removes flagged profiles and orphaned demo logins alike when asked to remove the demo", async () => {
    const h = harness({ existing: ["old-1"], orphans: ["orphan-1"] });
    expect(await removeDemo(h.admin as never)).toBe(2);
    expect(h.calls).toEqual([
      "profiles.select.eq",
      "auth.admin.listUsers",
      "profiles.select.in",
      "auth.admin.deleteUser",
      "auth.admin.deleteUser",
    ]);
  });
});

describe("demo load: which failures can have taken the old roster (#448)", () => {
  // The split is the delete-first order's consequence: `removeDemo` runs before the leave types
  // are even read, so everything from `user delete` onwards assumes the old demo is gone.
  const BEFORE = ["password too short", "profile lookup", "user lookup"] as const;
  const AFTER = [
    "user delete",
    "leave type lookup",
    "no active leave type",
    "user create",
    "profile insert",
    "sign-in",
    "request submit",
    "decision",
  ] as const;

  it.each(BEFORE)("leaves the old demo untouched when it stops at %s", (stage) => {
    expect(demoLoadTookOldRoster(stage)).toBe(false);
  });

  it.each(AFTER)("counts a stop at %s as destructive", (stage) => {
    expect(demoLoadTookOldRoster(stage)).toBe(true);
  });

  it("counts an unexpected error as destructive, because it can have fired mid-delete", () => {
    expect(demoLoadTookOldRoster("unexpected")).toBe(true);
  });

  it("classifies every stage, so a new one cannot be added without deciding which side it is on", () => {
    expect([...BEFORE, ...AFTER]).toEqual([...DEMO_LOAD_STAGES]);
  });
});

describe("demo load: every failure names its step (#214)", () => {
  const FAILURES: [string, (typeof DEMO_LOAD_STAGES)[number]][] = [
    ["profiles.select.eq", "profile lookup"],
    ["profiles.select.in", "profile lookup"],
    ["auth.admin.listUsers", "user lookup"],
    ["auth.admin.deleteUser", "user delete"],
    ["leave_types.select.order", "leave type lookup"],
    ["auth.admin.createUser", "user create"],
    ["profiles.insert", "profile insert"],
    ["auth.signInWithPassword", "sign-in"],
    ["rpc.submit_leave_request", "request submit"],
    ["rpc.decide_leave_request", "decision"],
  ];

  it.each(FAILURES)("reports a failure in %s as %s", async (call, stage) => {
    const h = harness({ existing: ["old-1"], orphans: ["orphan-1"], fail: (c) => (c === call ? "provider detail" : null) });
    expect(await stageOf(h)).toBe(stage);
  });

  it("reports a password too short to sign anyone in", async () => {
    // The action's own schema refuses this first, so it is defence in depth — but it is still a
    // step the loader can stop at, and "unexpected" would send someone looking in the wrong place.
    const h = harness();
    const stage = await loadDemo({ admin: h.admin as never, decider: h.decider as never, password: "short", newUserClient: h.newUserClient as never }).then(
      () => "resolved",
      (error: unknown) => {
        expect(error).toBeInstanceOf(DemoLoadError);
        return demoLoadStage(error);
      },
    );
    expect(stage).toBe("password too short");
  });

  it("reports a leave type set with nothing active in it", async () => {
    const h = harness({ leaveTypes: [{ id: "t0", name: "Annual", is_active: false, sort_order: 0 }] });
    expect(await stageOf(h)).toBe("no active leave type");
  });

  it("names the step and never the provider's text", async () => {
    const leaked = new Error(`duplicate key value violates unique constraint "profiles_email_key" DETAIL: Key (email)=(eden@away.test) already exists.`);
    expect(demoLoadStage(leaked)).toBe("unexpected");
    expect(demoLoadStage(leaked)).not.toMatch(/eden|profiles_email_key|DETAIL/);
    for (const stage of DEMO_LOAD_STAGES) expect(stage).toMatch(/^[a-z][a-z -]*$/);
    const h = harness({ fail: (c) => (c === "auth.admin.createUser" ? "provider detail" : null) });
    expect(await stageOf(h)).toBe("user create");
  });
});

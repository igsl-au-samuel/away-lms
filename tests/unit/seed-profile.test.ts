import { describe, expect, it } from "vitest";
import { planProfileWrite, type ProfileSeed } from "../../scripts/lib/seed-profile";

const ID = "3f2b6f27-4c1e-4f79-9a3d-2b1c6f0d5e11";

/** The payload `seed:local` builds for `admin@away.test`, including the key it looks the row up by. */
const SEED: ProfileSeed & { id: string } = {
  id: ID,
  email: "admin@away.test",
  full_name: "Alex Admin",
  role: "admin",
  region_code: "QLD",
  timezone: "Australia/Brisbane",
};

function liveWith(overrides: Partial<ProfileSeed>): ProfileSeed {
  return {
    email: SEED.email,
    full_name: SEED.full_name,
    role: SEED.role,
    region_code: SEED.region_code,
    timezone: SEED.timezone,
    ...overrides,
  };
}

describe("planProfileWrite", () => {
  it("writes the payload when there is no row yet, which is the fresh-stack path CI takes", () => {
    const plan = planProfileWrite(SEED, null);
    expect(plan.row).toEqual(SEED);
    expect(plan.line).toBe("created profile: admin@away.test — Alex Admin / admin / QLD / Australia/Brisbane");
  });

  it("writes nothing when the row is already exactly the seeded one", () => {
    const plan = planProfileWrite(SEED, liveWith({}));
    expect(plan.row).toBeNull();
    expect(plan.line).toBe("left profile as is: admin@away.test — Alex Admin / admin / QLD / Australia/Brisbane");
    expect(plan.line).not.toContain("a fresh seed writes");
  });

  it("keeps a hand-set region, which is the #369 case: HK set by a session, QLD forced back by a seed", () => {
    const plan = planProfileWrite(SEED, liveWith({ region_code: "HK" }));
    expect(plan.row).toBeNull();
    expect(plan.line).toContain("HK");
    expect(plan.line).toContain("a fresh seed writes region_code=QLD");
  });

  it("names every column it declined to overwrite, not only the first", () => {
    const plan = planProfileWrite(SEED, liveWith({ full_name: "Alex O.", role: "manager", region_code: "NSW" }));
    expect(plan.row).toBeNull();
    expect(plan.line).toContain("a fresh seed writes");
    expect(plan.line).toContain("full_name=Alex Admin");
    expect(plan.line).toContain("role=admin");
    expect(plan.line).toContain("region_code=QLD");
    expect(plan.line).not.toContain("timezone=");
    expect(plan.line).not.toContain("email=");
  });

  it("still writes nothing when every column it would have set differs", () => {
    const plan = planProfileWrite(SEED, liveWith({ email: "a@away.test", full_name: "N", role: "employee", region_code: "NT", timezone: "Australia/Darwin" }));
    expect(plan.row).toBeNull();
  });

  it("never puts the key in the diff, because id is how the row was found and not a column to force", () => {
    // The payload carries `id` and the narrowed read does not, so an implementation that compared the
    // payload's own keys would report `id=3f2b…` as a column the seed declined to write.
    const plan = planProfileWrite(SEED, liveWith({}));
    expect(plan.line).not.toContain("id=");
  });

  it("says which of the two happened, every time, so a run is never silent about the shared stack", () => {
    const prefixes = [planProfileWrite(SEED, null).line, planProfileWrite(SEED, liveWith({ region_code: "HK" })).line].map(
      (line) => line.slice(0, line.indexOf(":")),
    );
    expect(prefixes).toEqual(["created profile", "left profile as is"]);
  });

  it("is the second run of the same command: what the first wrote is live, so the second changes nothing", () => {
    const first = planProfileWrite(SEED, null);
    expect(first.row).not.toBeNull();
    const second = planProfileWrite(SEED, first.row!);
    expect(second.row).toBeNull();
    expect(second.line).toBe(first.line.replace("created profile", "left profile as is"));
  });
});

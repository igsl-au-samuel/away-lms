/**
 * The one decision `npm run seed:local` makes about a `profiles` row: write it only when it is missing.
 *
 * `specs/001-mvp/tasks.md:129` (T059) asked the script to *insert* the seeded rows, and an `upsert` is what
 * shipped, so every run wrote `full_name`, `email`, `role`, `region_code` and `timezone` back over whatever
 * the shared local stack actually held. Issue #369 caught it as a session collision: one session had set
 * `admin@away.test` to region `HK` to test the region switch, another ran the seed, and the `HK` was gone
 * with nothing in the output saying so. On three worktrees sharing one database (#361 Amendment 2) that
 * reads as a product bug to whoever loses the value.
 *
 * So the decision lives here rather than inline: it is the part worth testing, and a test of it needs no
 * database, no auth user and no write of any kind.
 */

/** The columns a seed payload carries, minus `id` — which is how the row is found, not something to force back. */
export type ProfileSeed = {
  email: string;
  full_name: string;
  role: string;
  region_code: string;
  timezone: string;
};

/** The columns a seed would have overwritten, named rather than read off the payload: `id` must never join this list. */
const SEED_COLUMNS = ["email", "full_name", "role", "region_code", "timezone"] as const;

export type ProfilePlan<P> = {
  /** The row to insert, or `null` when the existing row is left exactly as it is. */
  readonly row: P | null;
  /** The line for the terminal, which says which of the two happened. */
  readonly line: string;
};

function valuesFor(seed: ProfileSeed): string {
  return `${seed.full_name} / ${seed.role} / ${seed.region_code} / ${seed.timezone}`;
}

/**
 * `null` for a missing row means insert; anything else means do not write at all.
 *
 * A row that is only partly right — the name is stale, the region is one somebody set by hand, the role is
 * what this account had before it was promoted — is still left alone. Partly-right is how a silent overwrite
 * hides: a seed cannot tell a hand-set `HK` from a slip, so it is not the seed's call to make. `is_active`
 * and `is_demo` were never in the payload and still are not written, which is the one thing #369 measured as
 * already safe: a deactivated seeded account survived the old upsert, and survives this.
 */
export function planProfileWrite<P extends ProfileSeed>(desired: P, live: ProfileSeed | null): ProfilePlan<P> {
  if (live === null) {
    return { row: desired, line: `created profile: ${desired.email} — ${valuesFor(desired)}` };
  }

  // The seed's own value for each column that differs, because the point of the line is that the stack is
  // not in its seeded state — the live value is already printed, so naming the default is the new fact.
  const differs = SEED_COLUMNS.filter((column) => live[column] !== desired[column]).map(
    (column) => `${column}=${desired[column]}`,
  );

  const wouldHaveWritten = differs.length === 0 ? "" : ` (left alone; a fresh seed writes ${differs.join(", ")})`;
  return { row: null, line: `left profile as is: ${desired.email} — ${valuesFor(live)}${wouldHaveWritten}` };
}

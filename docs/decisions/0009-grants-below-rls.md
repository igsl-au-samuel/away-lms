# 0009 Table grants are hardened below RLS

**Status:** accepted · 2026-10-17

**Context:** ADR 0007 puts authorization in RLS. Supabase's default privileges also
give `anon` and `authenticated` every table privilege, including TRUNCATE, and give
`anon` execute on every new function. RLS doesn't apply to TRUNCATE, and a
function grant to `anon` is outside RLS altogether. The row 9 test showed that a
signed-in employee could truncate `public_holidays`.

**Decision:**
- Revoke TRUNCATE from `authenticated` on all `public` tables and in the default
  privileges (migration 001000), alongside the existing anon write revoke (000500).
- Revoke privileges that no role ever needs, so the attempt fails with `42501`
  instead of returning zero rows. This covers insert/delete on `profiles` and
  delete on `leave_types` and `holiday_regions`.
- Admin RPCs `revoke all … from public, anon` by name. Anon gets `42501`, not
  `not_allowed`.
- Trigger functions that validate input (`profiles_set_timezone`,
  `holiday_regions_check_tz`) run as `security definer`. This keeps
  `assert_valid_timezone` off the RPC surface.

**Consequences:** There are two layers to reason about (grants, then policies). Tests
assert the error code for each layer. Any new table inherits the revokes. Any new
RPC must repeat the `from public, anon` revoke, and the row tests catch a miss.

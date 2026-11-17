import "server-only";
import { GENERIC_ERROR, toActionResult, type ActionResult } from "../../lib/errors";
import type { AdminClients } from "../admin-users";

/**
 * Enables or disables every demo login in one go (FR-031): `admin_set_demo_active`
 * flips `is_active` on the demo profiles (admin only, checked in Postgres), then each
 * returned auth user is banned or unbanned. Real users are never touched.
 *
 * The two halves live in two systems, so this cannot be one transaction. What it does guarantee:
 * every demo account is called, and a failure never leaves one with an inactive profile that auth
 * still admits. See #375.
 */
export async function setDemoActive({ admin, user }: AdminClients, active: boolean): Promise<ActionResult<{ count: number }>> {
  const res = await user.rpc("admin_set_demo_active", { p_active: active });
  if (res.error) return toActionResult<{ count: number }>({ data: null, error: res.error });

  const duration = active ? "none" : "876000h";
  const failed: string[] = [];
  for (const id of res.data ?? []) {
    // Every account is called. Aborting on the first error is what left the rest untouched
    // mid-loop, so a transient Auth failure is retried once before it counts as a failure.
    const ban = await admin.auth.admin.updateUserById(id, { ban_duration: duration });
    if (ban.error) {
      const retry = await admin.auth.admin.updateUserById(id, { ban_duration: duration });
      if (retry.error) failed.push(id);
    }
  }

  if (failed.length) {
    // Only the disable direction can be undone. Flipping back to inactive after a failed *enable*
    // would make the already-unbanned accounts admissible with an inactive profile — the split
    // state, on purpose. A banned-but-active account is locked, which is the safe residue.
    if (!active) await user.rpc("admin_set_demo_active", { p_active: true });
    return { ok: false, code: "unknown", message: GENERIC_ERROR };
  }
  return { ok: true, data: { count: res.data?.length ?? 0 } };
}

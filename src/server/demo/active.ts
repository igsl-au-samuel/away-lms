import "server-only";
import { GENERIC_ERROR, toActionResult, type ActionResult } from "../../lib/errors";
import type { AdminClients } from "../admin-users";

/**
 * Enables or disables every demo login in one go (FR-031): `admin_set_demo_active`
 * flips `is_active` on the demo profiles (admin only, checked in Postgres), then each
 * returned auth user is banned or unbanned. Real users are never touched.
 */
export async function setDemoActive({ admin, user }: AdminClients, active: boolean): Promise<ActionResult<{ count: number }>> {
  const res = await user.rpc("admin_set_demo_active", { p_active: active });
  if (res.error) return toActionResult<{ count: number }>({ data: null, error: res.error });

  for (const id of res.data ?? []) {
    const ban = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    if (ban.error) return { ok: false, code: "unknown", message: GENERIC_ERROR };
  }
  return { ok: true, data: { count: res.data?.length ?? 0 } };
}

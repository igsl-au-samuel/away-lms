"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "../lib/errors";
import { setAllowanceSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed } from "../server/admin-action";

/** Sets a per-user, per-year allowance override, or removes it when `days` is null (FR-008). */
export async function setAllowance(input: unknown): Promise<ActionResult<null>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = setAllowanceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { user_id, leave_type_id, year, days, reason } = parsed.data;
  const res = await c.user.rpc("admin_set_allowance", {
    p_user_id: user_id,
    p_leave_type_id: leave_type_id,
    p_year: year,
    // supabase-js types the nullable numeric as number; null removes the override.
    p_days: days as number,
    p_reason: reason || undefined,
  });
  if (res.error) return toActionResult(res);
  revalidatePath(`/admin/users/${user_id}`);
  return { ok: true, data: null };
}

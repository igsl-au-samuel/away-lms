"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "../lib/errors";
import { inviteUserSchema, setUserActiveSchema, updateUserSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed } from "../server/admin-action";
import * as users from "../server/admin-users";

export async function inviteUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const res = await users.inviteUser(c, parsed.data);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

export async function setUserActive(input: unknown): Promise<ActionResult<null>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const res = await users.setUserActive(c, parsed.data.id, parsed.data.active);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

/** Name, role and region (FR-027). Demo users stay employees (demo_must_be_employee). */
export async function updateUser(input: unknown): Promise<ActionResult<null>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { id, full_name, role, region_code } = parsed.data;
  const res = await c.user.rpc("admin_update_user", {
    p_user_id: id,
    p_full_name: full_name,
    p_role: role,
    p_region_code: region_code,
  });
  if (res.error) return toActionResult(res);
  revalidatePath("/admin/users");
  return { ok: true, data: null };
}

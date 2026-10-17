import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { GENERIC_ERROR, toActionResult, type ActionResult } from "../lib/errors";

type Db = SupabaseClient<Database>;

/** `admin` = secret-key client (auth admin API); `user` = the signed-in admin's client (RPCs). */
export type AdminClients = { admin: Db; user: Db };

export type InviteInput = {
  email: string;
  full_name: string;
  role: Database["public"]["Enums"]["app_role"];
  region_code: string;
};

const failed = (): ActionResult<never> => ({ ok: false, code: "unknown", message: GENERIC_ERROR });

export async function inviteUser({ admin, user }: AdminClients, input: InviteInput): Promise<ActionResult<{ id: string }>> {
  const invited = await admin.auth.admin.inviteUserByEmail(input.email);
  if (invited.error || !invited.data.user) return failed();
  const id = invited.data.user.id;

  const profile = await user.rpc("admin_create_profile", {
    p_user_id: id,
    p_full_name: input.full_name,
    p_email: input.email,
    p_role: input.role,
    p_region_code: input.region_code,
  });
  if (profile.error) {
    // Compensate: don't leave an auth user without a profile.
    await admin.auth.admin.deleteUser(id);
    return toActionResult<{ id: string }>({ data: null, error: profile.error });
  }
  return { ok: true, data: { id } };
}

export async function setUserActive({ admin, user }: AdminClients, id: string, active: boolean): Promise<ActionResult<null>> {
  const res = await user.rpc("admin_set_active", { p_user_id: id, p_active: active });
  if (res.error) return toActionResult(res);

  const ban = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  if (ban.error) return failed();
  return { ok: true, data: null };
}

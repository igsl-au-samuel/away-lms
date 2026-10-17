"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../lib/supabase/server";
import { ERROR_COPY, GENERIC_ERROR, type ActionResult } from "../lib/errors";
import { inviteUserSchema, setUserActiveSchema } from "../lib/schemas";
import * as users from "../server/admin-users";
import { requireAdmin } from "../server/auth";
import { createAdminClient } from "../server/supabase-admin";

const notAllowed = (): ActionResult<never> => ({ ok: false, code: "not_allowed", message: ERROR_COPY.not_allowed });
const invalid = (message?: string): ActionResult<never> => ({
  ok: false,
  code: "invalid_input",
  message: message ?? GENERIC_ERROR,
});

async function clients() {
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  return { admin: createAdminClient(), user: await createClient() };
}

export async function inviteUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const c = await clients();
  if (!c) return notAllowed();
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const res = await users.inviteUser(c, parsed.data);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

export async function setUserActive(input: unknown): Promise<ActionResult<null>> {
  const c = await clients();
  if (!c) return notAllowed();
  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const res = await users.setUserActive(c, parsed.data.id, parsed.data.active);
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

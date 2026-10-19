"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../lib/supabase/server";
import { GENERIC_ERROR, type ActionResult } from "../lib/errors";
import { profileSchema } from "../lib/schemas";

/** Saves the signed-in user's region and timezone (FR-023). RLS limits the update to their own row. */
export async function updateProfile(input: unknown): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input", message: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, code: "not_allowed", message: GENERIC_ERROR };
  const { data, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", auth.user.id)
    .select("id");
  if (error || !data?.length) return { ok: false, code: "unknown", message: GENERIC_ERROR };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

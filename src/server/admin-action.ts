import "server-only";
import { createClient } from "../lib/supabase/server";
import { ERROR_COPY, GENERIC_ERROR, toActionResult, type ActionResult } from "../lib/errors";
import type { AdminClients } from "./admin-users";
import { requireAdmin } from "./auth";
import { createAdminClient } from "./supabase-admin";

export const notAllowed = (): ActionResult<never> => ({ ok: false, code: "not_allowed", message: ERROR_COPY.not_allowed });

export const invalid = (message?: string): ActionResult<never> => ({
  ok: false,
  code: "invalid_input",
  message: message ?? GENERIC_ERROR,
});

/** Both clients for an admin Server Action, or null when the caller isn't an active admin. */
export async function adminClients(): Promise<AdminClients | null> {
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  return { admin: createAdminClient(), user: await createClient() };
}

type Res<T> = { data: T | null; error: { message: string; code?: string; details?: string | null } | null };

/**
 * For direct table writes: a unique violation becomes `duplicate` with the given copy,
 * and a write that RLS filtered out (no row back) becomes `not_allowed`.
 */
export function writeResult<T>(res: Res<T>, duplicateMessage: string): ActionResult<T> {
  if (res.error?.code === "23505") return { ok: false, code: "duplicate", message: duplicateMessage };
  if (res.error?.code === "PGRST116") return notAllowed();
  return toActionResult(res);
}

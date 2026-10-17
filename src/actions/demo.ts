"use server";

import { revalidatePath } from "next/cache";
import { GENERIC_ERROR, type ActionResult } from "../lib/errors";
import { loadDemoSchema, setDemoActiveSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed } from "../server/admin-action";
import * as active from "../server/demo/active";
import * as loader from "../server/demo/loader";

/**
 * Loads or resets the demo (FR-029, FR-030). The password is passed to the loader and
 * dropped: never stored, never logged, never echoed back.
 */
export async function loadDemo(input: unknown): Promise<ActionResult<{ users: number; requests: number }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = loadDemoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const data = await loader.loadDemo({ admin: c.admin, decider: c.user, password: parsed.data.password });
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch {
    return { ok: false, code: "unknown", message: GENERIC_ERROR };
  }
}

/** Disables or re-enables every demo login in one action (FR-031). */
export async function setDemoActive(input: unknown): Promise<ActionResult<{ count: number }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = setDemoActiveSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const res = await active.setDemoActive(c, parsed.data.active);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

"use server";

import { revalidatePath } from "next/cache";
import { GENERIC_ERROR, type ActionResult } from "../lib/errors";
import { loadDemoSchema, setDemoActiveSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed } from "../server/admin-action";
import * as active from "../server/demo/active";
import * as loader from "../server/demo/loader";

/**
 * What an admin is told when the load died after the previous roster was already deleted: the
 * demo is now absent or half-built, and loading again — which starts by clearing whatever is
 * left — is the fix. Saying "please try again" without that is what #448 called unsafe.
 */
const DEMO_INCOMPLETE =
  "The demo load stopped after the previous demo had already been removed, so the demo is now incomplete. Loading the demo again rebuilds it.";

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
  } catch (error) {
    // Which step broke, and nothing else: a provider message can echo a row value, and the demo
    // password is in scope here. How far the roster got is what makes a half-built demo
    // diagnosable at all — until now every failure said only "Something went wrong" (#214).
    const stage = loader.demoLoadStage(error);
    console.error(`[demo] load failed at ${stage}`);
    if (loader.demoLoadTookOldRoster(stage)) {
      // The page still lists the roster that no longer exists unless it is re-rendered.
      revalidatePath("/", "layout");
      return { ok: false, code: "demo_incomplete", message: DEMO_INCOMPLETE };
    }
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

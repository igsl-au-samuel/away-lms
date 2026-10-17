"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/errors";
import { leaveTypeSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed, writeResult } from "../server/admin-action";

/**
 * Creates a leave type, or updates one when `id` is given: rename, cap or uncap, default
 * allowance, order, retire. Types are never deleted (FR-007); a changed default is
 * logged by a trigger in Postgres (research R12).
 */
export async function saveLeaveType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = leaveTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { id, ...fields } = parsed.data;
  const res = id
    ? await c.user.from("leave_types").update(fields).eq("id", id).select("id").single()
    : await c.user.from("leave_types").insert(fields).select("id").single();
  const result = writeResult(res, "A leave type with that name already exists.");
  if (result.ok) revalidatePath("/admin/leave-types");
  return result;
}

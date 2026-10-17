"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/errors";
import { deleteHolidaySchema, holidaySchema, regionSchema } from "../lib/schemas";
import { adminClients, invalid, notAllowed, writeResult } from "../server/admin-action";

/** Adds a holiday region (FR-028). Existing regions keep their code. */
export async function saveRegion(input: unknown): Promise<ActionResult<{ code: string }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = regionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const res = await c.user.from("holiday_regions").insert(parsed.data).select("code").single();
  const result = writeResult(res, "A region with that code already exists.");
  if (result.ok) revalidatePath("/admin/holidays");
  return result;
}

/** Adds a public holiday, or edits one when `id` is given (FR-028, US6-4). */
export async function saveHoliday(input: unknown): Promise<ActionResult<{ id: string }>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { id, ...fields } = parsed.data;
  const res = id
    ? await c.user.from("public_holidays").update(fields).eq("id", id).select("id").single()
    : await c.user.from("public_holidays").insert(fields).select("id").single();
  const result = writeResult(res, "That region already has a holiday on that date.");
  if (result.ok) revalidatePath("/admin/holidays");
  return result;
}

/** Removes a public holiday. Existing requests keep their stored day counts. */
export async function deleteHoliday(input: unknown): Promise<ActionResult<null>> {
  const c = await adminClients();
  if (!c) return notAllowed();
  const parsed = deleteHolidaySchema.safeParse(input);
  if (!parsed.success) return invalid();
  const res = await c.user.from("public_holidays").delete().eq("id", parsed.data.id).select("id").single();
  const result = writeResult(res, "");
  if (!result.ok) return result;
  revalidatePath("/admin/holidays");
  return { ok: true, data: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../lib/supabase/server";
import { ERROR_COPY, GENERIC_ERROR, toActionResult, type ActionResult, type ErrorCode } from "../lib/errors";
import { decideLeaveRequestSchema, leaveRequestSchema } from "../lib/schemas";

export type RequestPreview = {
  working_days: number | null;
  /** Null for uncapped types. */
  available_before: number | null;
  over_balance_days: number | null;
  /** Blocking problems; submit is refused while any are present. */
  errors: { code: string; message: string }[];
};

const invalid = (message?: string): ActionResult<never> => ({
  ok: false,
  code: "invalid_input",
  message: message ?? GENERIC_ERROR,
});

const copyFor = (code: string) => (Object.hasOwn(ERROR_COPY, code) ? ERROR_COPY[code as ErrorCode] : GENERIC_ERROR);

/** Working days, balance and problems for a draft request, without submitting it (FR-012–FR-014). */
export async function previewLeaveRequest(input: unknown): Promise<ActionResult<RequestPreview>> {
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const supabase = await createClient();
  const res = await supabase
    .rpc("preview_leave_request", {
      p_leave_type_id: parsed.data.leave_type_id,
      p_start: parsed.data.start_date,
      p_end: parsed.data.end_date,
    })
    .single();
  const result = toActionResult(res);
  if (!result.ok) return result;
  const row = result.data;
  return {
    ok: true,
    data: {
      working_days: row.working_days,
      available_before: row.available_before,
      over_balance_days: row.over_balance_days,
      errors: row.errors.map((code) => ({ code, message: copyFor(code) })),
    },
  };
}

/** Submits a pending request for the signed-in user (FR-011). */
export async function submitLeaveRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const supabase = await createClient();
  const res = await supabase.rpc("submit_leave_request", {
    p_leave_type_id: parsed.data.leave_type_id,
    p_start: parsed.data.start_date,
    p_end: parsed.data.end_date,
    p_note: parsed.data.note || undefined,
  });
  const result = toActionResult(res);
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/requests");
  return { ok: true, data: { id: result.data.id } };
}

/** Approves or declines a pending request, with an optional comment (FR-017–FR-020). */
export async function decideLeaveRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = decideLeaveRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const supabase = await createClient();
  const res = await supabase.rpc("decide_leave_request", {
    p_request_id: parsed.data.id,
    p_outcome: parsed.data.outcome,
    p_comment: parsed.data.comment || undefined,
  });
  const result = toActionResult(res);
  if (!result.ok) return result;
  revalidatePath("/approvals");
  revalidatePath("/");
  revalidatePath("/requests");
  return { ok: true, data: { id: result.data.id } };
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import { ERROR_COPY, GENERIC_ERROR, type ActionResult } from "../lib/errors";
import { safeNext } from "../lib/safe-next";
import { passwordResetSchema, setPasswordSchema, signInSchema } from "../lib/schemas";

const invalidCredentials = (): ActionResult<never> => ({
  ok: false,
  code: "invalid_credentials",
  message: ERROR_COPY.invalid_credentials,
});

/** Any failure (bad input, wrong password, unknown email, banned) returns the same error. */
export async function signIn(input: unknown, next?: string | null): Promise<ActionResult<never>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return invalidCredentials();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return invalidCredentials();
  redirect(safeNext(next ?? null));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** Always `ok`, so the response never reveals whether an email has an account. */
export async function requestPasswordReset(input: unknown): Promise<ActionResult<null>> {
  const parsed = passwordResetSchema.safeParse(input);
  if (parsed.success) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email);
  }
  return { ok: true, data: null };
}

export async function setPassword(input: unknown): Promise<ActionResult<null>> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input", message: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, code: "unknown", message: GENERIC_ERROR };
  return { ok: true, data: null };
}

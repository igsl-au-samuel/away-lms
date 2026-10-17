export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Code-to-copy map. Codes match the `message` of RPC errors (P0001). */
export const ERROR_COPY = {
  not_allowed: "You don't have permission to do that.",
  not_found: "We couldn't find that.",
  profile_exists: "A profile for that email already exists.",
  cannot_change_own_role: "You can't change your own role.",
  cannot_deactivate_self: "You can't deactivate your own account.",
  invalid_credentials: "Invalid email or password.",
  demo_must_be_employee: "Demo accounts must have the employee role.",
} as const satisfies Record<string, string>;

export type ErrorCode = keyof typeof ERROR_COPY;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type DbResponse<T> = {
  data: T | null;
  error: { message: string; details?: string | null } | null;
};

export function toActionResult<T>(res: DbResponse<T>): ActionResult<T> {
  if (!res.error) return { ok: true, data: res.data as T };
  const code = res.error.message;
  if (Object.hasOwn(ERROR_COPY, code)) {
    return { ok: false, code, message: ERROR_COPY[code as ErrorCode] };
  }
  return { ok: false, code: "unknown", message: GENERIC_ERROR };
}

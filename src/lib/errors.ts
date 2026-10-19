export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Code-to-copy map. Codes match the `message` of RPC errors (P0001). */
export const ERROR_COPY = {
  not_allowed: "You don't have permission to do that.",
  not_found: "We couldn't find that.",
  profile_exists: "A profile for that email already exists.",
  cannot_change_own_role: "You can't change your own role.",
  cannot_deactivate_self: "You can't deactivate your own account.",
  invalid_credentials: "Invalid email or password.",
  type_uncapped: "Allowances apply to capped leave types only.",
  demo_must_be_employee: "Demo accounts must have the employee role.",
  invalid_range: "The end date is before the start date.",
  spans_years: "A request can't span two leave years. Split it at 31 December.",
  no_working_days: "Those dates have no working days.",
  overlap: "You already have leave booked on some of those dates.",
  type_inactive: "That leave type is no longer available.",
  note_too_long: "Keep the note to 500 characters or fewer.",
  invalid_outcome: "A request can only be approved or declined.",
  own_request: "You can't approve or decline your own request.",
  already_decided: "Someone has already decided that request.",
  confirmation_required: "Run the preview first and show the result to the person. Then confirm with the token it gave.",
} as const satisfies Record<string, string>;

export type ErrorCode = keyof typeof ERROR_COPY;

/** User-facing copy for an error code, or the generic message for codes we don't know. */
export function copyFor(code: string): string {
  return Object.hasOwn(ERROR_COPY, code) ? ERROR_COPY[code as ErrorCode] : GENERIC_ERROR;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type DbResponse<T> = {
  data: T | null;
  error: { message: string; details?: string | null } | null;
};

export function toActionResult<T>(res: DbResponse<T>): ActionResult<T> {
  if (!res.error) return { ok: true, data: res.data as T };
  const code = Object.hasOwn(ERROR_COPY, res.error.message) ? res.error.message : "unknown";
  return { ok: false, code, message: copyFor(code) };
}

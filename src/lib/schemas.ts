import { z } from "zod";

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const setPasswordSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters."),
});

export const passwordResetSchema = z.object({
  email: z.email(),
});

export const inviteUserSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(1, "Enter a name.").max(100),
  role: z.enum(["employee", "manager", "admin"]),
  region_code: z.string().min(1, "Choose a region."),
});

export const setUserActiveSchema = z.object({
  id: z.uuid(),
  active: z.boolean(),
});

export const leaveRequestSchema = z.object({
  leave_type_id: z.uuid(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  note: z.string().trim().max(500, "Keep the note to 500 characters or fewer.").optional(),
});

export const decideLeaveRequestSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(["approved", "declined"]),
  comment: z.string().trim().max(500, "Keep the comment to 500 characters or fewer.").optional(),
});

const TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));
const regionCode = z.string().regex(/^[A-Z]{2,5}$/, "Choose a region.");
const timezone = z.string().refine((tz) => TIMEZONES.has(tz), "Choose a timezone.");
/** Days in half-day steps, as numeric(5,1) stores them. */
const days = z.number().min(0, "Days can't be negative.").max(366).multipleOf(0.5, "Use whole or half days.");

export const profileSchema = z.object({
  region_code: regionCode,
  timezone,
});

export const updateUserSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1, "Enter a name.").max(100),
  role: z.enum(["employee", "manager", "admin"]),
  region_code: regionCode,
});

export const loadDemoSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters."),
});

export const setDemoActiveSchema = z.object({
  active: z.boolean(),
});

export const setAllowanceSchema = z.object({
  user_id: z.uuid(),
  leave_type_id: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  days: days.nullable(),
  reason: z.string().trim().max(500, "Keep the reason to 500 characters or fewer.").optional(),
});

export const leaveTypeSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Enter a name.").max(50, "Keep the name to 50 characters or fewer."),
    is_capped: z.boolean(),
    default_allowance: days.nullable(),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(999),
  })
  .refine((t) => t.is_capped === (t.default_allowance !== null), {
    message: "A capped type needs a default allowance; an uncapped type has none.",
    path: ["default_allowance"],
  });

export const regionSchema = z.object({
  code: regionCode,
  name: z.string().trim().min(1, "Enter a name.").max(100),
  default_timezone: timezone,
});

export const holidaySchema = z.object({
  id: z.uuid().optional(),
  region_code: regionCode,
  holiday_date: z.iso.date(),
  name: z.string().trim().min(1, "Enter a name.").max(80, "Keep the name to 80 characters or fewer."),
});

export const deleteHolidaySchema = z.object({
  id: z.uuid(),
});

export type SignInInput =z.infer<typeof signInSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

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

export const profileSchema = z.object({
  region_code: z.string().regex(/^[A-Z]{2,5}$/, "Choose a region."),
  timezone: z.string().refine((tz) => TIMEZONES.has(tz), "Choose a timezone."),
});

export type SignInInput =z.infer<typeof signInSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

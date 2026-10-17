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

export type SignInInput = z.infer<typeof signInSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

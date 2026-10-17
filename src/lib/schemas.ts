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

export type SignInInput = z.infer<typeof signInSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

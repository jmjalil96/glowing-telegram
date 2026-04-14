import { z } from "zod";

const MAX_EMAIL_LENGTH = 320;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1_024;

const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, "Email is too long.")
  .email("Enter a valid email address.")
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  )
  .max(MAX_PASSWORD_LENGTH, "Password is too long.");

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(MAX_PASSWORD_LENGTH, "Password is too long."),
});

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginFormValues = z.output<typeof loginFormSchema>;
export type ForgotPasswordFormValues = z.output<
  typeof forgotPasswordFormSchema
>;
export type ResetPasswordFormValues = z.output<typeof resetPasswordFormSchema>;

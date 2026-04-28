import { z } from "zod";

const MAX_EMAIL_LENGTH = 320;

export const forgotPasswordSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .max(MAX_EMAIL_LENGTH)
      .email()
      .transform((email) => email.toLowerCase()),
  }),
};

export type ForgotPasswordInput = z.output<typeof forgotPasswordSchema.body>;

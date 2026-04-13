import { z } from "zod";

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1_024;

export const loginSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .max(MAX_EMAIL_LENGTH)
      .email()
      .transform((email) => email.toLowerCase()),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  }),
};

export type LoginInput = z.output<typeof loginSchema.body>;

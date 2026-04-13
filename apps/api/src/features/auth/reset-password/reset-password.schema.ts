import { z } from "zod";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1_024;
const MAX_TOKEN_LENGTH = 1_024;

export const resetPasswordSchema = {
  body: z.object({
    token: z.string().trim().min(1).max(MAX_TOKEN_LENGTH),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  }),
};

export type ResetPasswordInput = z.output<typeof resetPasswordSchema.body>;

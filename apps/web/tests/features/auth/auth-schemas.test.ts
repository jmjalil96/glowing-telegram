import { describe, expect, it } from "vitest";

import {
  forgotPasswordFormSchema,
  loginFormSchema,
  resetPasswordFormSchema,
} from "@/features/auth/auth-schemas";

describe("auth-schemas", () => {
  it("normalizes email inputs for login and forgot-password", () => {
    expect(
      loginFormSchema.parse({
        email: "  USER@Example.COM  ",
        password: "Techbros123!",
      }),
    ).toEqual({
      email: "user@example.com",
      password: "Techbros123!",
    });
    expect(
      forgotPasswordFormSchema.parse({
        email: "  USER@Example.COM  ",
      }),
    ).toEqual({
      email: "user@example.com",
    });
  });

  it("rejects blank email inputs before submission", () => {
    const loginResult = loginFormSchema.safeParse({
      email: "   ",
      password: "Techbros123!",
    });
    const forgotPasswordResult = forgotPasswordFormSchema.safeParse({
      email: "",
    });

    expect(loginResult.success).toBe(false);
    expect(forgotPasswordResult.success).toBe(false);

    if (loginResult.success || forgotPasswordResult.success) {
      throw new Error("Expected auth schemas to reject blank email inputs");
    }

    expect(loginResult.error.issues[0]?.message).toBe(
      "Enter a valid email address.",
    );
    expect(forgotPasswordResult.error.issues[0]?.message).toBe(
      "Enter a valid email address.",
    );
  });

  it("requires reset passwords to satisfy the local length contract", () => {
    const result = resetPasswordFormSchema.safeParse({
      confirmPassword: "short",
      password: "short",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected reset schema to reject a short password");
    }

    expect(result.error.issues[0]?.message).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("requires matching reset passwords", () => {
    const result = resetPasswordFormSchema.safeParse({
      confirmPassword: "Techbros456!",
      password: "Techbros123!",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected reset schema to reject mismatched passwords");
    }

    expect(result.error.issues[0]?.message).toBe("Passwords do not match.");
    expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

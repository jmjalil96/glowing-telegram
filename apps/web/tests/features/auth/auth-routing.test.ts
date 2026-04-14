import { describe, expect, it } from "vitest";

import {
  getPostLoginHref,
  sanitizeAuthRedirect,
  validateLoginSearch,
  validateResetPasswordSearch,
} from "@/features/auth/auth-routing";

describe("auth-routing", () => {
  it("accepts only safe in-app post-login redirects", () => {
    expect(sanitizeAuthRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeAuthRedirect("/dashboard?tab=overview")).toBe(
      "/dashboard?tab=overview",
    );
    expect(sanitizeAuthRedirect("/")).toBe("/");
  });

  it("rejects external, guest-loop, and malformed redirects", () => {
    expect(sanitizeAuthRedirect("//evil.example.com")).toBeUndefined();
    expect(sanitizeAuthRedirect("/login")).toBeUndefined();
    expect(sanitizeAuthRedirect("/forgot-password")).toBeUndefined();
    expect(sanitizeAuthRedirect("/reset-password?token=abc")).toBeUndefined();
    expect(sanitizeAuthRedirect("dashboard")).toBeUndefined();
    expect(sanitizeAuthRedirect("   ")).toBeUndefined();
  });

  it("normalizes login search and falls back to the default redirect", () => {
    expect(validateLoginSearch({ redirect: "/dashboard#tab" })).toEqual({
      redirect: "/dashboard#tab",
    });
    expect(validateLoginSearch({ redirect: "//evil.example.com" })).toEqual({});
    expect(getPostLoginHref({})).toBe("/dashboard");
  });

  it("trims reset-password tokens and drops missing tokens", () => {
    expect(validateResetPasswordSearch({ token: "  token-123  " })).toEqual({
      token: "token-123",
    });
    expect(validateResetPasswordSearch({ token: "   " })).toEqual({});
    expect(validateResetPasswordSearch({})).toEqual({});
  });
});

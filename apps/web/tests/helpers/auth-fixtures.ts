import type { AuthenticatedUser } from "@/features/auth/auth-client";

export const defaultAuthenticatedUser: AuthenticatedUser = Object.freeze({
  displayName: "Playwright User",
  email: "playwright-user@techbros.local",
  emailVerifiedAt: "2025-01-01T00:00:00.000Z",
  tenantId: "tenant-playwright-user",
  userId: "user-playwright-user",
});

export const playwrightAuthFixture = Object.freeze({
  displayName: defaultAuthenticatedUser.displayName,
  email: defaultAuthenticatedUser.email,
  password: "Techbros123!",
});

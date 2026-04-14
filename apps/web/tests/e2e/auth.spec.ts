import { expect, test } from "@playwright/test";

import { authStateFile } from "./auth-helpers.js";
import { loginThroughUi } from "./auth-helpers.js";

test("anonymous dashboard access redirects to login and returns to dashboard after sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
  await page.getByLabel("Email").fill("playwright-user@techbros.local");
  await page.getByLabel("Password").fill("Techbros123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Workspace dashboard")).toBeVisible();
});

test.describe("authenticated browser contracts", () => {
  test.use({
    storageState: authStateFile,
  });

  test("authenticated visits to /login are redirected to /dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Workspace dashboard")).toBeVisible();
  });

  test("authenticated sessions survive a full page reload", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Workspace dashboard")).toBeVisible();

    await page.reload();

    await expect(page.getByText("Workspace dashboard")).toBeVisible();
  });
});

test("logout returns the browser to guest behavior", async ({ page }) => {
  await loginThroughUi(page);
  await page.getByRole("button", { name: /playwright user/i }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();

  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
  await expect(page.getByText("Sign in to Techbros")).toBeVisible();
});

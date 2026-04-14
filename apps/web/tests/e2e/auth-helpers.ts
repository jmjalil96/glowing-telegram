import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

import { playwrightAuthFixture } from "../helpers/auth-fixtures.js";

export const authStateFile = fileURLToPath(
  new URL("./.auth/user.json", import.meta.url),
);

export const ensureAuthStateDirectory = (): void => {
  mkdirSync(dirname(authStateFile), {
    recursive: true,
  });
};

export const loginThroughUi = async (page: Page): Promise<void> => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(playwrightAuthFixture.email);
  await page.getByLabel("Password").fill(playwrightAuthFixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Workspace dashboard")).toBeVisible();
};

import { test as setup } from "@playwright/test";

import {
  authStateFile,
  ensureAuthStateDirectory,
  loginThroughUi,
} from "./auth-helpers.js";

setup("create authenticated browser state", async ({ page }) => {
  ensureAuthStateDirectory();

  await loginThroughUi(page);
  await page.context().storageState({
    path: authStateFile,
  });
});

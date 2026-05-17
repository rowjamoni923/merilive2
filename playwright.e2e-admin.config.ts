import { defineConfig, devices } from "@playwright/test";

/**
 * Real-admin E2E config — drives the live /admin/face-verification page
 * against the real Supabase backend with a dedicated seed.
 *
 * Skipped (no projects to run) unless E2E_ADMIN_TOKEN, E2E_ADMIN_ACCESS_TOKEN,
 * and SUPABASE_SERVICE_ROLE_KEY are all present in the environment.
 *
 * Run locally:  npm run test:e2e:admin
 */
const enabled =
  !!process.env.E2E_ADMIN_TOKEN &&
  !!process.env.E2E_ADMIN_ACCESS_TOKEN &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export default defineConfig({
  testDir: "./tests/e2e-admin",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: enabled ? "./tests/e2e-admin/fixtures/global-setup.ts" : undefined,
  globalTeardown: enabled ? "./tests/e2e-admin/fixtures/global-teardown.ts" : undefined,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: enabled
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [],
});

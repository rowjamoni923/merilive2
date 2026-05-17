import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for behavioral specs (NOT visual regression).
 * Runs static-fixture specs under tests/e2e/ — no Vite, no Supabase, no auth.
 * Use `npm run test:e2e` locally and in CI.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

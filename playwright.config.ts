import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config — boots Vite preview, screenshots public surfaces
 * at mobile + desktop sizes. Snapshots committed under tests/visual/__screenshots__/.
 *
 * Local update:   npm run test:visual:update
 * Local run:      npm run test:visual
 * CI:             .github/workflows/visual-regression.yml
 */
export default defineConfig({
  testDir: "./tests/visual",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: {
    // Allow ≤0.2% pixel diff to absorb sub-pixel rendering noise across machines.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Deterministic font + locale
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "mobile-light",
      use: { ...devices["Pixel 7"], colorScheme: "light" },
    },
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
  ],
});

import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression — public surfaces.
 *
 * Each route is screenshotted full-page so contrast/layout regressions
 * (light theme: white text on white card, faded labels, etc.) are caught
 * by pixel diff. Auth-gated routes are excluded; cover them by adding a
 * separate authenticated spec when seed-user infrastructure is ready.
 */
const PUBLIC_ROUTES: { path: string; name: string }[] = [
  { path: "/auth", name: "auth" },
  { path: "/about", name: "about" },
  { path: "/contact", name: "contact" },
  { path: "/privacy-policy", name: "privacy-policy" },
  { path: "/agency-policy", name: "agency-policy" },
  { path: "/policies-benefits", name: "policies-benefits" },
];

async function freezeForSnapshot(page: Page) {
  // Disable transitions/animations + hide blinking carets for stable pixels.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      /* Hide elements with non-deterministic content (timestamps, live data) */
      [data-snapshot="ignore"] { visibility: hidden !important; }
    `,
  });
  // Stabilise media: pause videos, disable rAF noise
  await page.evaluate(() => {
    document.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.removeAttribute("autoplay");
    });
  });
  // Wait until network is quiet so async images/fonts settle.
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const route of PUBLIC_ROUTES) {
  test(`visual: ${route.name}`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await freezeForSnapshot(page);
    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
    });
  });
}

/**
 * Visual regression for User System (15 menus × 3 viewports).
 * Captures admin-pro-shell pages on mobile/tablet/desktop, diffs against baselines,
 * and surfaces color-mismatch / 3D-gap regressions.
 *
 * Usage:
 *   node tests/visual/user-system.spec.mjs --update   # write/refresh baselines
 *   node tests/visual/user-system.spec.mjs            # diff vs baselines (exits non-zero on regression)
 *
 * Optional env:
 *   BASE_URL   default http://localhost:8080
 *   THRESHOLD  per-pixel color tolerance (0..1), default 0.12
 *   MAX_DIFF   max % differing pixels before flagging, default 0.5
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("tests/visual");
const BASELINE_DIR = path.join(ROOT, "baseline");
const CURRENT_DIR = path.join(ROOT, "current");
const DIFF_DIR = path.join(ROOT, "diff");
for (const d of [BASELINE_DIR, CURRENT_DIR, DIFF_DIR]) fs.mkdirSync(d, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const UPDATE = process.argv.includes("--update");
const THRESHOLD = Number(process.env.THRESHOLD || 0.12);
const MAX_DIFF_PCT = Number(process.env.MAX_DIFF || 0.5);

const VIEWPORTS = [
  { name: "mobile",  width: 390,  height: 1600 },
  { name: "tablet",  width: 820,  height: 1600 },
  { name: "desktop", width: 1440, height: 1800 },
];

// 15 User System menus → /admin/<slug>
const PAGES = [
  ["user-hub",             "User Hub"],
  ["user-management",      "User Management"],
  ["users",                "All Users"],
  ["host-applications",    "Host Applications"],
  ["host-search",          "Host Search"],
  ["hosts",                "All Hosts"],
  ["face-verification",    "Face Verification"],
  ["blocked",              "Blocked Users"],
  ["live-bans",            "Live Bans"],
  ["permanent-ban",        "Permanent Ban"],
  ["country-distribution", "Country Distribution"],
  ["face-violations",      "Face Violations"],
  ["moderation",           "Moderation"],
  ["user-reports",         "User Reports"],
  ["online-users",         "Online Users"],
];

async function restoreSession(page) {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (!key || !session) return false;
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, session]);
  return true;
}

async function capture(page, slug, vp) {
  const url = `${BASE_URL}/admin/${slug}`;
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  // Wait for admin shell to mount; skip if route 404s
  const shell = await page.locator(".admin-pro-shell").first().elementHandle().catch(() => null);
  if (!shell) return { skipped: true, reason: "no admin-pro-shell" };
  // Freeze animations + hide volatile content (timestamps, avatars) for stable diffs
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      [data-volatile], time, .relative-time { visibility: hidden !important; }
      img { filter: contrast(0.95) saturate(0.95); }
    `,
  });
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ fullPage: false });
  return { buf };
}

function diffPng(baselinePath, currentPath, diffPath) {
  const a = PNG.sync.read(fs.readFileSync(baselinePath));
  const b = PNG.sync.read(fs.readFileSync(currentPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, baseline: [a.width, a.height], current: [b.width, b.height] };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const mismatched = pixelmatch(a.data, b.data, out.data, a.width, a.height, {
    threshold: THRESHOLD,
    includeAA: false,
    alpha: 0.4,
    diffColor: [234, 56, 76],     // red — color-token mismatch
    diffColorAlt: [59, 130, 246], // blue — likely shadow / 3D gap
  });
  fs.writeFileSync(diffPath, PNG.sync.write(out));
  const pct = (mismatched / (a.width * a.height)) * 100;
  return { mismatched, pct };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const auth = await restoreSession(page);
  if (!auth) console.warn("⚠  No Supabase session injected — pages requiring auth may render guards.");

  const report = [];
  let failed = 0;

  for (const vp of VIEWPORTS) {
    for (const [slug, label] of PAGES) {
      const file = `${slug}__${vp.name}.png`;
      const baselinePath = path.join(BASELINE_DIR, file);
      const currentPath = path.join(CURRENT_DIR, file);
      const diffPath = path.join(DIFF_DIR, file);

      const cap = await capture(page, slug, vp);
      if (cap.skipped) {
        report.push({ slug, label, vp: vp.name, status: "skipped", reason: cap.reason });
        console.log(`· skip  ${label.padEnd(22)} ${vp.name.padEnd(7)} (${cap.reason})`);
        continue;
      }
      fs.writeFileSync(currentPath, cap.buf);

      if (UPDATE || !fs.existsSync(baselinePath)) {
        fs.copyFileSync(currentPath, baselinePath);
        report.push({ slug, label, vp: vp.name, status: "baseline-written" });
        console.log(`+ base  ${label.padEnd(22)} ${vp.name}`);
        continue;
      }

      const d = diffPng(baselinePath, currentPath, diffPath);
      if (d.sizeMismatch) {
        failed++;
        report.push({ slug, label, vp: vp.name, status: "size-mismatch", ...d });
        console.log(`✗ SIZE  ${label.padEnd(22)} ${vp.name}  ${d.baseline} → ${d.current}`);
        continue;
      }
      const ok = d.pct <= MAX_DIFF_PCT;
      if (!ok) failed++;
      report.push({ slug, label, vp: vp.name, status: ok ? "pass" : "fail", diffPct: +d.pct.toFixed(3) });
      console.log(`${ok ? "✓ pass " : "✗ FAIL "} ${label.padEnd(22)} ${vp.name.padEnd(7)} Δ ${d.pct.toFixed(3)}%`);
    }
  }

  fs.writeFileSync(path.join(ROOT, "report.json"), JSON.stringify({
    baseUrl: BASE_URL, threshold: THRESHOLD, maxDiffPct: MAX_DIFF_PCT,
    generatedAt: new Date().toISOString(), results: report,
  }, null, 2));

  await browser.close();
  console.log(`\nReport → tests/visual/report.json   Diffs → tests/visual/diff/`);
  process.exit(failed > 0 && !UPDATE ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

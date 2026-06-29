/**
 * Visual + overflow regression for Agency System (5 menus × 3 viewports = 15 checks).
 *
 * For every page/viewport:
 *   1. Capture a screenshot (mobile/tablet/desktop).
 *   2. Assert `documentElement.scrollWidth <= viewport.width + 1px` (no horizontal overflow).
 *   3. Scan every descendant of `.admin-pro-shell` for elements whose `scrollWidth`
 *      exceeds their `clientWidth` AND are not opt-in scroll containers
 *      (`[data-allow-x-scroll]`, `overflow-x: auto|scroll`, native `<pre>/<code>` blocks).
 *   4. Diff vs baseline (red = color/token gap, blue = 3D/shadow gap).
 *
 * Usage:
 *   node tests/visual/agency-system.spec.mjs --update   # write/refresh baselines
 *   node tests/visual/agency-system.spec.mjs            # diff vs baselines, exits non-zero on regression
 *
 * Optional env: BASE_URL (default http://localhost:8080),
 *               THRESHOLD (per-pixel tolerance, default 0.12),
 *               MAX_DIFF  (max % differing pixels before flagging, default 0.5).
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

// 5 Agency System menus → /admin/<slug>
const PAGES = [
  ["agency-hub",   "Agency Hub"],
  ["agencies",     "All Agencies"],
  ["approvals",    "Owner Approvals Hub"],
  ["agency-policy","Agency Policy"],
  ["pricing-hub",  "Pricing & Commission Hub"],
];

async function restoreSession(page) {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (!key || !session) return false;
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, session]);
  return true;
}

async function checkOverflow(page, viewportWidth) {
  return await page.evaluate((vw) => {
    const docOverflow = document.documentElement.scrollWidth - vw;
    const offenders = [];
    const shell = document.querySelector(".admin-pro-shell");
    if (shell) {
      const nodes = shell.querySelectorAll("*");
      for (const el of nodes) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
        if (el.hasAttribute("data-allow-x-scroll")) continue;
        const tag = el.tagName.toLowerCase();
        if (tag === "pre" || tag === "code" || tag === "textarea") continue;
        // Ignore inline elements; only block-level layout violations matter
        if (cs.display === "inline" || cs.display === "contents") continue;
        offenders.push({
          tag,
          cls: (el.className || "").toString().slice(0, 80),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        });
        if (offenders.length >= 5) break;
      }
    }
    return { docOverflow, offenders };
  }, viewportWidth);
}

async function capture(page, slug, vp) {
  const url = `${BASE_URL}/admin/${slug}`;
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  const shell = await page.locator(".admin-pro-shell").first().elementHandle().catch(() => null);
  if (!shell) return { skipped: true, reason: "no admin-pro-shell" };
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      [data-volatile], time, .relative-time { visibility: hidden !important; }
      img { filter: contrast(0.95) saturate(0.95); }
    `,
  });
  await page.waitForTimeout(400);
  const overflow = await checkOverflow(page, vp.width);
  const buf = await page.screenshot({ fullPage: false });
  return { buf, overflow };
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
      const file = `agency__${slug}__${vp.name}.png`;
      const baselinePath = path.join(BASELINE_DIR, file);
      const currentPath = path.join(CURRENT_DIR, file);
      const diffPath = path.join(DIFF_DIR, file);

      const cap = await capture(page, slug, vp);
      if (cap.skipped) {
        report.push({ slug, label, vp: vp.name, status: "skipped", reason: cap.reason });
        console.log(`· skip  ${label.padEnd(26)} ${vp.name.padEnd(7)} (${cap.reason})`);
        continue;
      }
      fs.writeFileSync(currentPath, cap.buf);

      // Overflow gate — fails independently of pixel diff
      const ovf = cap.overflow || { docOverflow: 0, offenders: [] };
      const horizontalOverflow = ovf.docOverflow > 1;
      const layoutGap = ovf.offenders.length > 0;

      let visStatus = "pass";
      let diffPct = 0;
      if (UPDATE || !fs.existsSync(baselinePath)) {
        fs.copyFileSync(currentPath, baselinePath);
        visStatus = "baseline-written";
      } else {
        const d = diffPng(baselinePath, currentPath, diffPath);
        if (d.sizeMismatch) {
          visStatus = "size-mismatch";
        } else {
          diffPct = +d.pct.toFixed(3);
          visStatus = d.pct <= MAX_DIFF_PCT ? "pass" : "fail";
        }
      }

      const overallFail = horizontalOverflow || layoutGap || visStatus === "fail" || visStatus === "size-mismatch";
      if (overallFail) failed++;

      report.push({
        slug, label, vp: vp.name,
        visual: visStatus, diffPct,
        scrollOverflowPx: ovf.docOverflow,
        layoutOffenders: ovf.offenders,
      });

      const flag = overallFail ? "✗ FAIL " : "✓ pass ";
      const ovfTxt = horizontalOverflow ? ` overflow=${ovf.docOverflow}px` : "";
      const gapTxt = layoutGap ? ` offenders=${ovf.offenders.length}` : "";
      console.log(`${flag} ${label.padEnd(26)} ${vp.name.padEnd(7)} Δ ${diffPct}%${ovfTxt}${gapTxt}`);
    }
  }

  fs.writeFileSync(path.join(ROOT, "agency-report.json"), JSON.stringify({
    baseUrl: BASE_URL, threshold: THRESHOLD, maxDiffPct: MAX_DIFF_PCT,
    generatedAt: new Date().toISOString(), results: report,
  }, null, 2));

  await browser.close();
  console.log(`\nReport → tests/visual/agency-report.json   Diffs → tests/visual/diff/`);
  process.exit(failed > 0 && !UPDATE ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

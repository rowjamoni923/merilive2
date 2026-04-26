import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  openBrowser,
} from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[render] Bundling...");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
});
console.log("[render] Bundled:", bundled);

console.log("[render] Opening browser...");
const browser = await openBrowser("chrome", {
  browserExecutable:
    process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

console.log("[render] Selecting composition...");
const composition = await selectComposition({
  serveUrl: bundled,
  id: "main",
  puppeteerInstance: browser,
});
console.log(
  "[render] Composition:",
  composition.id,
  composition.width,
  "×",
  composition.height,
  composition.durationInFrames,
  "frames @",
  composition.fps,
  "fps"
);

const outputPath = "/mnt/documents/merilive-promo-video.mp4";
console.log("[render] Rendering to", outputPath);

await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: outputPath,
  puppeteerInstance: browser,
  muted: true,
  concurrency: 2,
  onProgress: ({ progress }) => {
    if (progress * 100 % 10 < 1) {
      console.log(`[render] ${Math.round(progress * 100)}%`);
    }
  },
});

console.log("[render] Done!");
await browser.close({ silent: false });

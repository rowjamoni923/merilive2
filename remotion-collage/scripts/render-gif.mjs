import { bundle } from "@remotion/bundler";
import {
  renderFrames,
  selectComposition,
  openBrowser,
} from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[gif] Bundling...");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
});

console.log("[gif] Opening browser...");
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({
  serveUrl: bundled,
  id: "main",
  puppeteerInstance: browser,
});

console.log(
  "[gif] Composition:",
  composition.width,
  "x",
  composition.height,
  composition.durationInFrames,
  "frames @",
  composition.fps,
  "fps"
);

const framesDir = "/tmp/gif-frames";
if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
fs.mkdirSync(framesDir, { recursive: true });

console.log("[gif] Rendering frames to", framesDir);
// Render at full duration; we'll exclude the last frame so loop seam is clean
await renderFrames({
  composition,
  serveUrl: bundled,
  outputDir: framesDir,
  imageFormat: "png",
  puppeteerInstance: browser,
  concurrency: 2,
  onFrameUpdate: (rendered) => {
    if (rendered % 30 === 0) {
      console.log(`[gif]   rendered ${rendered}/${composition.durationInFrames}`);
    }
  },
  onStart: () => {},
});

await browser.close({ silent: false });

// Frames: element-0.png ... element-(N-1).png
// Drop last frame so first==last seam is clean for loop
const total = composition.durationInFrames;
const lastIdx = total - 1;
const lastFile = path.join(framesDir, `element-${lastIdx}.png`);
if (fs.existsSync(lastFile)) {
  fs.unlinkSync(lastFile);
  console.log("[gif] Removed last frame for seamless loop");
}

const outputPath = "/mnt/documents/merilive-promo.gif";
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const fps = composition.fps;
// Resize to 540x960 (half of 1080x1920) for reasonable GIF size
const scale = "540:960";

console.log("[gif] Building palette...");
execSync(
  `${ffmpeg} -y -framerate ${fps} -i ${framesDir}/element-%d.png -vf "scale=${scale}:flags=lanczos,palettegen=stats_mode=diff" /tmp/palette.png`,
  { stdio: "inherit" }
);

console.log("[gif] Encoding GIF to", outputPath);
execSync(
  `${ffmpeg} -y -framerate ${fps} -i ${framesDir}/element-%d.png -i /tmp/palette.png -lavfi "scale=${scale}:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 ${outputPath}`,
  { stdio: "inherit" }
);

const stat = fs.statSync(outputPath);
console.log(`[gif] Done! ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

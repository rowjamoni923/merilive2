export type VapSideBySideLayout = 'alpha-left' | 'alpha-right';

const vapCompositeHint = new Map<string, boolean>();
const vapLayoutCache = new Map<string, VapSideBySideLayout>();

const hintKey = (url: string) => (url || '').split('#')[0];

export const markVapCompositeHint = (url: string, isComposite: boolean): void => {
  if (!url) return;
  vapCompositeHint.set(hintKey(url), isComposite);
};

export const getVapCompositeHint = (url: string): boolean => {
  if (!url) return false;
  return vapCompositeHint.get(hintKey(url)) === true;
};

export const getCachedVapLayout = (url: string): VapSideBySideLayout | null => {
  if (!url) return null;
  return vapLayoutCache.get(hintKey(url)) ?? null;
};

export const cacheVapLayout = (url: string, layout: VapSideBySideLayout): void => {
  if (!url) return;
  vapLayoutCache.set(hintKey(url), layout);
};

/**
 * VAP MP4s are composite videos: RGB and alpha-mask frames packed together.
 * Square exports are usually 2:1. Portrait live-stream gift exports are often
 * ~0.85–1.35:1 because two portrait halves are placed side-by-side.
 */
export const isLikelyVapCompositeSize = (width: number, height: number): boolean => {
  if (!width || !height || width < 100 || height < 100) return false;
  const ratio = width / height;
  return Math.abs(ratio - 2) < 0.08 || (ratio >= 0.85 && ratio <= 1.35);
};

interface SideStats {
  /** Sum of per-pixel chroma (max(r,g,b) - min(r,g,b)). Mask side ≈ 0. */
  chroma: number;
  /** Count of extreme-luma pixels (near pure black/white). Mask is binary-ish. */
  extremes: number;
  /** Count of midtone pixels (luma 32–224). RGB art has gradients/midtones. */
  midtones: number;
  /** Horizontal gradient energy — RGB art has more texture than a mask. */
  gradient: number;
  count: number;
}

const newStats = (): SideStats => ({ chroma: 0, extremes: 0, midtones: 0, gradient: 0, count: 0 });

const addStats = (a: SideStats, b: SideStats): void => {
  a.chroma += b.chroma;
  a.extremes += b.extremes;
  a.midtones += b.midtones;
  a.gradient += b.gradient;
  a.count += b.count;
};

const sampleFrame = (
  video: HTMLVideoElement,
): { left: SideStats; right: SideStats } | null => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const half = canvas.width / 2;
    const left = newStats();
    const right = newStats();

    for (let y = 0; y < canvas.height; y += 2) {
      let prevLumaL = -1;
      let prevLumaR = -1;
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const luma = (r + g + b) / 3;
        const isLeft = x < half;
        const side = isLeft ? left : right;
        side.chroma += chroma;
        if (luma < 24 || luma > 232) side.extremes += 1;
        if (luma >= 32 && luma <= 224) side.midtones += 1;
        if (isLeft) {
          if (prevLumaL >= 0) side.gradient += Math.abs(luma - prevLumaL);
          prevLumaL = luma;
        } else {
          if (prevLumaR >= 0) side.gradient += Math.abs(luma - prevLumaR);
          prevLumaR = luma;
        }
        side.count += 1;
      }
    }
    return { left, right };
  } catch {
    return null;
  }
};

/**
 * SMART side decision.
 *
 * Primary signal: per-pixel chroma. The alpha-mask half is grayscale by
 * definition (R==G==B → chroma ≈ 0) while the RGB half has measurable color.
 * Measured on the real gift library: mask side avg chroma < 0.5, RGB side
 * 7–110 — even for "white" themed gifts (castle/angel) at content frames.
 *
 * Secondary signals (only for truly grayscale art where both halves have
 * near-zero chroma): the RGB half carries more midtones and more horizontal
 * texture (gradient energy), while a mask is binary black/white.
 *
 * Returns null when the frame is blank / inconclusive — callers should
 * sample a later frame instead of guessing.
 */
const decideFromStats = (
  left: SideStats,
  right: SideStats,
): VapSideBySideLayout | null => {
  const lc = left.chroma / Math.max(1, left.count);
  const rc = right.chroma / Math.max(1, right.count);
  const lExt = left.extremes / Math.max(1, left.count);
  const rExt = right.extremes / Math.max(1, right.count);
  const lMid = left.midtones / Math.max(1, left.count);
  const rMid = right.midtones / Math.max(1, right.count);
  const lGrad = left.gradient / Math.max(1, left.count);
  const rGrad = right.gradient / Math.max(1, right.count);

  // Blank frame guard: nothing drawn yet on either half.
  const blank =
    lExt > 0.97 && rExt > 0.97 && lGrad < 0.8 && rGrad < 0.8 && lc < 0.5 && rc < 0.5;
  if (blank) return null;

  // PRIMARY: chroma. The colored half is the RGB half.
  const chromaDiff = lc - rc;
  if (Math.abs(chromaDiff) >= 1 && Math.max(lc, rc) >= 1.5) {
    return chromaDiff > 0 ? 'alpha-right' : 'alpha-left';
  }

  // SECONDARY (grayscale art): vote with midtones / texture / binary-ness.
  // Positive vote ⇒ LEFT half is the RGB art ⇒ layout 'alpha-right'.
  let vote = 0;
  const midDiff = lMid - rMid;
  if (Math.abs(midDiff) >= 0.08) vote += midDiff > 0 ? 1 : -1;
  const gradDiff = lGrad - rGrad;
  if (Math.abs(gradDiff) >= 0.6) vote += gradDiff > 0 ? 1 : -1;
  const extDiff = lExt - rExt; // mask side is MORE extreme (binary B/W)
  if (Math.abs(extDiff) >= 0.1) vote += extDiff > 0 ? -1 : 1;

  if (vote > 0) return 'alpha-right';
  if (vote < 0) return 'alpha-left';
  return null;
};

/**
 * Single-frame detection. Returns a decision only when the current frame has
 * enough signal; otherwise null. NEVER guesses — guessing (and worse,
 * caching the guess) is what used to show the white alpha-mask half.
 */
export const detectVapSideBySideLayout = (
  video: HTMLVideoElement,
  cachedUrl?: string,
): VapSideBySideLayout | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!isLikelyVapCompositeSize(width, height)) return null;

  if (cachedUrl) {
    const cached = getCachedVapLayout(cachedUrl);
    if (cached) return cached;
  }

  const stats = sampleFrame(video);
  if (!stats) return null;
  const decided = decideFromStats(stats.left, stats.right);
  if (decided && cachedUrl) cacheVapLayout(cachedUrl, decided);
  return decided;
};

/**
 * SMART multi-frame resolver. The first frames of a gift export are usually
 * blank, so we keep sampling the video as it plays (every ~180ms, up to ~8s)
 * and also accumulate stats across frames for grayscale-art exports. The
 * decision is cached ONLY when it comes from real pixels.
 *
 * The previous implementation seeked once and had a 600ms timeout that
 * CACHED a hard-coded 'alpha-right' guess — on slow networks the seek never
 * finished in time and every white/silver gift rendered its mask half.
 *
 * `fallback` is returned (NOT cached) if the clip never shows content.
 */
export const resolveVapLayoutSmart = (
  video: HTMLVideoElement,
  cachedUrl?: string,
  fallback: VapSideBySideLayout = 'alpha-left',
): Promise<VapSideBySideLayout> => {
  return new Promise((resolve) => {
    if (cachedUrl) {
      const cached = getCachedVapLayout(cachedUrl);
      if (cached) return resolve(cached);
    }

    const aggLeft = newStats();
    const aggRight = newStats();
    let frames = 0;
    let done = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let safety: ReturnType<typeof setTimeout> | null = null;

    const finish = (layout: VapSideBySideLayout, fromPixels: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      if (safety) clearTimeout(safety);
      if (fromPixels && cachedUrl) cacheVapLayout(cachedUrl, layout);
      resolve(layout);
    };

    const tick = () => {
      if (done) return;
      if (!video.isConnected && frames > 0) {
        // Player unmounted — decide from what we have.
        const agg = decideFromStats(aggLeft, aggRight);
        return finish(agg ?? fallback, !!agg);
      }
      if (video.readyState < 2) return;
      const stats = sampleFrame(video);
      if (!stats) return;
      const decided = decideFromStats(stats.left, stats.right);
      if (decided) return finish(decided, true);
      addStats(aggLeft, stats.left);
      addStats(aggRight, stats.right);
      frames += 1;
      // Accumulated decision for weak per-frame signals (grayscale art).
      if (frames >= 4) {
        const agg = decideFromStats(aggLeft, aggRight);
        if (agg) return finish(agg, true);
      }
    };

    // Immediate attempt, then keep watching playback frames.
    tick();
    if (done) return;
    timer = setInterval(tick, 180);
    safety = setTimeout(() => {
      const agg = decideFromStats(aggLeft, aggRight);
      finish(agg ?? fallback, !!agg);
    }, 8000);
  });
};

/**
 * Back-compat alias — older callers import detectVapLayoutWithSeek.
 * Now backed by the smart multi-frame resolver (no seek, no guess-caching).
 */
export const detectVapLayoutWithSeek = (
  video: HTMLVideoElement,
  cachedUrl?: string,
  fallback: VapSideBySideLayout = 'alpha-left',
): Promise<VapSideBySideLayout> => resolveVapLayoutSmart(video, cachedUrl, fallback);

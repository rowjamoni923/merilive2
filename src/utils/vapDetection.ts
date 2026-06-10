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
  chroma: number;
  extremes: number;
  count: number;
}

const sampleFrame = (
  video: HTMLVideoElement,
): { left: SideStats; right: SideStats } | null => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 72;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const half = canvas.width / 2;
    const left: SideStats = { chroma: 0, extremes: 0, count: 0 };
    const right: SideStats = { chroma: 0, extremes: 0, count: 0 };

    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const luma = (r + g + b) / 3;
        const extreme = luma < 24 || luma > 224 ? 1 : 0;
        const side = x < half ? left : right;
        side.chroma += chroma;
        side.extremes += extreme;
        side.count += 1;
      }
    }
    return { left, right };
  } catch {
    return null;
  }
};

const decideFromStats = (
  left: SideStats,
  right: SideStats,
): VapSideBySideLayout | null => {
  const leftAvg = left.chroma / Math.max(1, left.count);
  const rightAvg = right.chroma / Math.max(1, right.count);
  const leftExtRatio = left.extremes / Math.max(1, left.count);
  const rightExtRatio = right.extremes / Math.max(1, right.count);

  // Mask side is grayscale by definition (R==G==B → chroma ~= 0) and
  // usually pure black or pure white (extreme luma). RGB side always has
  // measurable chroma when there's any colored content on screen.
  // We pick the side with the LOWER average chroma as the alpha mask.
  const diff = leftAvg - rightAvg;

  // Strong signal: one side has clearly more color than the other.
  if (Math.abs(diff) >= 2) {
    return diff > 0 ? 'alpha-right' : 'alpha-left';
  }

  // Weak chroma signal — fall back to extremes (mask is pure B/W).
  const extDiff = leftExtRatio - rightExtRatio;
  if (Math.abs(extDiff) >= 0.15) {
    return extDiff > 0 ? 'alpha-left' : 'alpha-right';
  }

  return null;
};

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
  if (stats) {
    const decided = decideFromStats(stats.left, stats.right);
    if (decided) {
      if (cachedUrl) cacheVapLayout(cachedUrl, decided);
      return decided;
    }
  }

  // Frame was blank / inconclusive. Defer to size-based fallback for known
  // professional VAP layouts. Square 2:1 exports → alpha right (industry
  // standard from VAP encoder). Portrait halves → alpha right as well; the
  // old default of 'alpha-left' was guessing wrong on the majority of
  // assets and showing the white mask half to users.
  const ratio = width / height;
  if (Math.abs(ratio - 2) < 0.08) return 'alpha-right';
  if (ratio >= 0.85 && ratio <= 1.35) return 'alpha-right';
  return 'alpha-right';
};

/**
 * When the first decoded frame is blank/transparent the chroma sampler can't
 * tell which half is RGB. This helper seeks the video to a middle frame and
 * runs detection again. Safe to call once after metadata is loaded — restores
 * playback position on completion.
 */
export const detectVapLayoutWithSeek = (
  video: HTMLVideoElement,
  cachedUrl?: string,
): Promise<VapSideBySideLayout> => {
  return new Promise((resolve) => {
    const first = detectVapSideBySideLayout(video, cachedUrl);
    if (first) return resolve(first);

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) return resolve('alpha-right');

    const originalTime = video.currentTime;
    const target = Math.min(duration * 0.4, Math.max(0.3, duration * 0.4));
    let done = false;
    const finish = (layout: VapSideBySideLayout) => {
      if (done) return;
      done = true;
      try { video.currentTime = originalTime; } catch { /* noop */ }
      video.removeEventListener('seeked', onSeeked);
      if (cachedUrl) cacheVapLayout(cachedUrl, layout);
      resolve(layout);
    };
    const onSeeked = () => {
      const second = detectVapSideBySideLayout(video, cachedUrl) ?? 'alpha-right';
      finish(second);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch {
      finish('alpha-right');
    }
    // Safety: never block forever.
    setTimeout(() => finish('alpha-right'), 600);
  });
};

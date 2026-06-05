export type VapLayout = 'alpha-left' | 'alpha-right' | 'alpha-top' | 'alpha-bottom';

const vapCompositeHint = new Map<string, boolean>();

const hintKey = (url: string) => (url || '').split('#')[0];

export const markVapCompositeHint = (url: string, isComposite: boolean): void => {
  if (!url) return;
  vapCompositeHint.set(hintKey(url), isComposite);
};

export const getVapCompositeHint = (url: string): boolean => {
  if (!url) return false;
  return vapCompositeHint.get(hintKey(url)) === true;
};

/**
 * VAP MP4s are composite videos: RGB and alpha-mask frames packed together.
 * Square exports are usually 2:1 (Side-by-Side).
 * Portrait live-stream gift exports are often ~1:1 but stacked Top-Bottom or Side-by-Side.
 */
export const isLikelyVapCompositeSize = (width: number, height: number): boolean => {
  if (!width || !height || width < 100 || height < 100) return false;
  const ratio = width / height;
  // Professional VAP exports are often:
  // 2:1 (Side-by-Side RGB + Alpha)
  // 1:2 (Stacked Top-Bottom)
  // 1:1.125 (Special portrait stacked used in newer Tencent exports)
  return (
    Math.abs(ratio - 2) < 0.15 || // Side-by-Side (RGB+Alpha)
    Math.abs(ratio - 0.5) < 0.15 || // Top-Bottom (RGB+Alpha)
    Math.abs(ratio - 1) < 0.15 ||   // 1:1 stacked
    Math.abs(ratio - 0.88) < 0.1 ||  // 1:1.125 portrait stacked
    (ratio >= 0.7 && ratio <= 1.45) // Possible stacked or portrait side-by-side
  );
};

export const detectVapLayout = (video: HTMLVideoElement): VapLayout | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!isLikelyVapCompositeSize(width, height)) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      const checkArea = (xStart: number, yStart: number, xEnd: number, yEnd: number) => {
        let chroma = 0;
        let extremes = 0;
        let count = 0;
        for (let y = yStart; y < yEnd; y += 4) {
          for (let x = xStart; x < xEnd; x += 4) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const c = Math.max(r, g, b) - Math.min(r, g, b);
            const luma = (r + g + b) / 3;
            chroma += c;
            if (luma < 24 || luma > 230) extremes++;
            count++;
          }
        }
        return { chroma: chroma / count, extremes: extremes / count };
      };

      const left = checkArea(0, 0, 64, 128);
      const right = checkArea(64, 0, 128, 128);
      const top = checkArea(0, 0, 128, 64);
      const bottom = checkArea(0, 64, 128, 128);

      // A mask area usually has low chroma (mostly grayscale) and high extremes (black or white)
      const looksLikeMask = (stat: { chroma: number, extremes: number }, other: { chroma: number, extremes: number }) => {
        return stat.chroma < 15 && (stat.chroma < other.chroma * 0.6 || stat.extremes > other.extremes * 1.2);
      };

      // Check Side-by-Side first (more common)
      if (looksLikeMask(left, right)) return 'alpha-left';
      if (looksLikeMask(right, left)) return 'alpha-right';
      
      // Check Top-Bottom
      if (looksLikeMask(top, bottom)) return 'alpha-top';
      if (looksLikeMask(bottom, top)) return 'alpha-bottom';

      // Fallback based on aspect ratio if detection is fuzzy
      const ratio = width / height;
      if (ratio > 1.5) {
        // If 2:1 and we can't tell, alpha-left is the most common industry standard (Tencent)
        return 'alpha-left';
      }
      if (ratio < 0.7) {
        return 'alpha-bottom'; // Standard for portrait stacked
      }
      
      // If none of the 4 quadrants look like a mask area but it's a known VAP size,
      // default to alpha-left (most common portrait layout).
      return 'alpha-left'; 
    }
  } catch {
    // Ignore cross-origin issues
  }

  const ratio = width / height;
  if (Math.abs(ratio - 2) < 0.15) return 'alpha-left';
  if (Math.abs(ratio - 0.5) < 0.15) return 'alpha-bottom';
  return null;
};

/** @deprecated use detectVapLayout */
export const detectVapSideBySideLayout = (video: HTMLVideoElement) => {
  const layout = detectVapLayout(video);
  if (layout === 'alpha-left' || layout === 'alpha-right') return layout;
  return null;
};
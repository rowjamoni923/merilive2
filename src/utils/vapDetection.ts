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
  // Professional VAP exports (Tencent standard):
  // 2:1 (Side-by-Side RGB + Alpha) -> ratio ~2.0
  // 1:2 (Stacked Top-Bottom) -> ratio ~0.5
  // 1.125:1 or similar (Portrait stacked/SBS) -> ratio ~1.125
  return (
    Math.abs(ratio - 2) < 0.25 || // Side-by-Side (RGB+Alpha)
    Math.abs(ratio - 0.5) < 0.15 || // Top-Bottom (RGB+Alpha)
    Math.abs(ratio - 1) < 0.15 ||   // 1:1 stacked
    Math.abs(ratio - 0.88) < 0.15 ||  // 1:1.125 portrait stacked
    (ratio >= 0.6 && ratio <= 1.6) // Broad range for any potential composite
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
        let totalLuma = 0;
        let count = 0;
        for (let y = yStart; y < yEnd; y += 2) {
          for (let x = xStart; x < xEnd; x += 2) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Chroma check: mask areas are usually grayscale (low chroma)
            const c = Math.max(r, g, b) - Math.min(r, g, b);
            const luma = (r + g + b) / 3;
            chroma += c;
            totalLuma += luma;
            // Extremes check: mask areas are often very black or very white
            if (luma < 15 || luma > 240) extremes++;
            count++;
          }
        }
        return { 
          chroma: chroma / count, 
          extremes: extremes / count, 
          avgLuma: totalLuma / count 
        };
      };

      const left = checkArea(0, 0, 64, 128);
      const right = checkArea(64, 0, 128, 128);
      const top = checkArea(0, 0, 128, 64);
      const bottom = checkArea(0, 64, 128, 128);

      // Detection heuristic: 
      // A mask area has VERY low chroma (grayscale) compared to RGB area.
      // We also check 'extremes' because mask edges are sharp.
      const isMaskArea = (stat: any, other: any) => {
        return stat.chroma < 12 && (stat.chroma < other.chroma * 0.5 || stat.extremes > other.extremes * 1.5);
      };

      // 1. Check Side-by-Side (SBS) - Most common
      if (isMaskArea(left, right)) return 'alpha-left';
      if (isMaskArea(right, left)) return 'alpha-right';
      
      // 2. Check Top-Bottom (Stacked)
      if (isMaskArea(top, bottom)) return 'alpha-top';
      if (isMaskArea(bottom, top)) return 'alpha-bottom';

      // 3. Aspect ratio fallbacks if pixel analysis is inconclusive (e.g. cross-origin restriction)
      const ratio = width / height;
      if (ratio > 1.6) return 'alpha-left'; // Standard 2:1 SBS
      if (ratio < 0.6) return 'alpha-bottom'; // Standard 1:2 Stacked
      
      // Industry default for portrait VAP (like the image provided) is Alpha-Left
      return 'alpha-left'; 
    }
  } catch {
    // Ignore cross-origin issues
  }

  const ratio = width / height;
  if (ratio > 1.6) return 'alpha-left';
  if (ratio < 0.6) return 'alpha-bottom';
  return 'alpha-left'; // Default to alpha-left for unknown portrait files
};

/** @deprecated use detectVapLayout */
export const detectVapSideBySideLayout = (video: HTMLVideoElement) => {
  const layout = detectVapLayout(video);
  if (layout === 'alpha-left' || layout === 'alpha-right') return layout;
  return null;
};
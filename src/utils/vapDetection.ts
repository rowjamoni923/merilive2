export type VapSideBySideLayout = 'alpha-left' | 'alpha-right';

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
 * Square exports are usually 2:1. Portrait live-stream gift exports are often
 * ~0.85–1.35:1 because two portrait halves are placed side-by-side.
 */
export const isLikelyVapCompositeSize = (width: number, height: number): boolean => {
  if (!width || !height || width < 100 || height < 100) return false;
  const ratio = width / height;
  return Math.abs(ratio - 2) < 0.08 || (ratio >= 0.85 && ratio <= 1.35);
};

export const detectVapSideBySideLayout = (video: HTMLVideoElement): VapSideBySideLayout | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!isLikelyVapCompositeSize(width, height)) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 72;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const half = canvas.width / 2;
      let leftChroma = 0;
      let rightChroma = 0;
      let leftExtremes = 0;
      let rightExtremes = 0;
      let leftCount = 0;
      let rightCount = 0;

      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          const luma = (r + g + b) / 3;
          const extreme = luma < 24 || luma > 224 ? 1 : 0;
          if (x < half) {
            leftChroma += chroma;
            leftExtremes += extreme;
            leftCount += 1;
          } else {
            rightChroma += chroma;
            rightExtremes += extreme;
            rightCount += 1;
          }
        }
      }

      const left = leftChroma / Math.max(1, leftCount);
      const right = rightChroma / Math.max(1, rightCount);
      const leftExtremeRatio = leftExtremes / Math.max(1, leftCount);
      const rightExtremeRatio = rightExtremes / Math.max(1, rightCount);
      const leftLooksMask = left < 12 || (left < right * 0.55 && leftExtremeRatio >= rightExtremeRatio * 0.8);
      const rightLooksMask = right < 12 || (right < left * 0.55 && rightExtremeRatio >= leftExtremeRatio * 0.8);

      if (leftLooksMask && !rightLooksMask) return 'alpha-left';
      if (rightLooksMask && !leftLooksMask) return 'alpha-right';
      if (Math.abs(left - right) > 8) return right > left ? 'alpha-left' : 'alpha-right';
    }
  } catch {
    // Cross-origin or first-frame read can fail; size fallback below still keeps
    // known professional VAP layouts working instead of falling back to raw MP4.
  }

  const ratio = width / height;
  if (ratio >= 0.85 && ratio <= 1.35) return 'alpha-left';
  if (Math.abs(ratio - 2) < 0.08) return 'alpha-right';
  return 'alpha-right';
};
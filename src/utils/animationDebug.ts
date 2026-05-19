/**
 * Animation debug flag — gates verbose SVGA / animation completion logging.
 *
 * Enable in browser console:
 *   localStorage.setItem('svgaDebug', '1')   // persistent
 *   window.__SVGA_DEBUG__ = true             // session-only
 *
 * Disable:
 *   localStorage.removeItem('svgaDebug')
 *
 * Or pass `debug` prop directly to <FixedAnimationFrame debug />.
 */
export type AnimationCompletionSource = 'native' | 'safety-timer' | 'unknown';

declare global {
  interface Window {
    __SVGA_DEBUG__?: boolean;
  }
}

export const isAnimationDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.__SVGA_DEBUG__) return true;
  try {
    return window.localStorage?.getItem('svgaDebug') === '1';
  } catch {
    return false;
  }
};

const ICON: Record<AnimationCompletionSource, string> = {
  native: '✅',
  'safety-timer': '⚠️',
  unknown: '❔',
};

export const logAnimationCompletion = (
  tag: string,
  source: AnimationCompletionSource,
  meta: { elapsed?: number; expected?: number; src?: string } = {},
) => {
  if (!isAnimationDebugEnabled()) return;
  const { elapsed, expected, src } = meta;
  const drift = expected && elapsed ? elapsed - expected : undefined;
  const parts = [
    `[${tag}] ${ICON[source]} onComplete (${source})`,
    elapsed != null ? `elapsed=${elapsed}ms` : null,
    expected ? `expected=${expected}ms` : null,
    drift != null ? `drift=${drift > 0 ? '+' : ''}${drift}ms` : null,
    src ? `src=${src.split('/').pop()?.split('?')[0]}` : null,
  ].filter(Boolean);
  // eslint-disable-next-line no-console
  console.log(parts.join(' | '));
};

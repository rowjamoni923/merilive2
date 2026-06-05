import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const warmedVideos = new Map<string, HTMLVideoElement>();
const inFlight = new Set<string>();
const MAX_WARMED_VIDEOS = 8;

const normalizeVideoUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const normalized = normalizeGiftMediaUrl(url) || url;
  return VIDEO_RE.test(normalized.split('#')[0]) ? normalized : null;
};

const postServiceWorkerWarm = (url: string) => {
  try {
    const sw = navigator.serviceWorker?.controller;
    if (sw) sw.postMessage({ type: 'WARM_GIFT_MEDIA', urls: [url] });
  } catch {}
};

const trimWarmPool = () => {
  while (warmedVideos.size > MAX_WARMED_VIDEOS) {
    const first = warmedVideos.keys().next().value as string | undefined;
    if (!first) return;
    const video = warmedVideos.get(first);
    warmedVideos.delete(first);
    try {
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    } catch {}
  }
};

const runWhenIdle = (task: () => void, timeout = 1800) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(task, { timeout });
  else window.setTimeout(task, Math.min(timeout, 700));
};

export const isGiftVideoUrl = (url?: string | null): boolean => !!normalizeVideoUrl(url);

export function prewarmGiftVideo(url?: string | null, options: { eager?: boolean } = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const normalized = normalizeVideoUrl(url);
  if (!normalized || warmedVideos.has(normalized) || inFlight.has(normalized)) return;

  const start = () => {
    if (warmedVideos.has(normalized)) return;
    inFlight.add(normalized);
    postServiceWorkerWarm(normalized);

    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.src = normalized;
      warmedVideos.set(normalized, video);
      trimWarmPool();

      const done = () => inFlight.delete(normalized);
      video.oncanplaythrough = done;
      video.onloadeddata = done;
      video.onerror = () => {
        warmedVideos.delete(normalized);
        inFlight.delete(normalized);
        try { video.removeAttribute('src'); video.load(); } catch {}
      };
      window.setTimeout(done, 7000);
      video.load();

      fetch(normalized, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }).catch(() => {});
    } catch {
      inFlight.delete(normalized);
    }
  };

  if (options.eager) start();
  else runWhenIdle(start);
}

export function prewarmGiftVideos(urls: Array<string | null | undefined>, max = 4): void {
  if (typeof window === 'undefined') return;
  const normalized = urls.map(normalizeVideoUrl).filter(Boolean) as string[];
  Array.from(new Set(normalized)).slice(0, max).forEach((url, index) => {
    window.setTimeout(() => prewarmGiftVideo(url), index * 300);
  });
}
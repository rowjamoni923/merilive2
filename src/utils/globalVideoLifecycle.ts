/**
 * Pkg357 — Global video lifecycle manager.
 *
 * Goal (user mandate): Chamet-class instant feel + no broken half-loaded media.
 *
 * Does three things:
 *  1. When the tab/app is hidden (visibilitychange === 'hidden' OR pagehide),
 *     pause EVERY <video> element in the DOM. Saves bandwidth + battery and
 *     prevents the "video kept playing in background" jank when the user
 *     returns to another screen.
 *  2. When a <video> scrolls off-screen (IntersectionObserver), pause it.
 *     When it scrolls back into view AND it was playing before (data attr),
 *     resume. Mirrors TikTok/Reels behavior.
 *  3. Watches the DOM (MutationObserver) so any newly-mounted <video>
 *     element automatically gets observed without each component opting in.
 *
 * NOTE: We intentionally do NOT touch LiveKit publisher/subscriber video
 * elements (they carry `data-livekit` / `data-lk-*` attributes set by the
 * LiveKit React SDK). Pausing those would kill the live stream.
 */

let installed = false;

const SKIP_SELECTOR =
  'video[data-lk-local-participant], video[data-lk-participant], video[data-livekit], video[data-no-auto-pause]';

function isSkippable(v: HTMLVideoElement): boolean {
  try {
    return !!v.closest(SKIP_SELECTOR) || v.matches?.(SKIP_SELECTOR);
  } catch {
    return false;
  }
}

function pauseAll(): void {
  const vids = document.querySelectorAll<HTMLVideoElement>('video');
  vids.forEach((v) => {
    if (isSkippable(v)) return;
    if (!v.paused) {
      try {
        v.dataset.wasPlaying = '1';
        v.pause();
      } catch {
        /* ignore */
      }
    }
  });
}

function resumeVisible(): void {
  const vids = document.querySelectorAll<HTMLVideoElement>('video[data-was-playing="1"]');
  vids.forEach((v) => {
    if (isSkippable(v)) return;
    delete v.dataset.wasPlaying;
    // Only auto-resume if still in the viewport.
    const rect = v.getBoundingClientRect();
    const inView =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || 0) &&
      rect.left < (window.innerWidth || 0);
    if (inView) {
      v.play().catch(() => {
        /* autoplay-blocked is fine */
      });
    }
  });
}

// IntersectionObserver: pause when leaving viewport, resume when re-entering
let io: IntersectionObserver | null = null;
function getIO(): IntersectionObserver {
  if (io) return io;
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const v = entry.target as HTMLVideoElement;
        if (isSkippable(v)) return;
        if (entry.isIntersecting) {
          if (v.dataset.wasPlaying === '1') {
            delete v.dataset.wasPlaying;
            v.play().catch(() => {});
          }
        } else if (!v.paused) {
          v.dataset.wasPlaying = '1';
          try {
            v.pause();
          } catch {
            /* ignore */
          }
        }
      });
    },
    { threshold: 0.1, rootMargin: '50px' }
  );
  return io;
}

function observeVideo(v: HTMLVideoElement): void {
  if (isSkippable(v)) return;
  if (v.dataset.lifecycleObserved === '1') return;
  v.dataset.lifecycleObserved = '1';
  try {
    getIO().observe(v);
  } catch {
    /* ignore */
  }
}

// MutationObserver to auto-attach to newly-mounted <video> elements
let mo: MutationObserver | null = null;

export function installGlobalVideoLifecycle(): void {
  if (installed) return;
  if (typeof document === 'undefined') return;
  installed = true;

  // (1) tab visibility
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') pauseAll();
      else resumeVisible();
    },
    { passive: true }
  );

  // (2) page lifecycle (BFCache + native app background)
  window.addEventListener('pagehide', pauseAll, { passive: true });
  window.addEventListener('blur', pauseAll, { passive: true });

  // (3) attach IntersectionObserver to all existing + future <video> elements
  document.querySelectorAll<HTMLVideoElement>('video').forEach(observeVideo);
  mo = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as HTMLElement;
        if (el.tagName === 'VIDEO') observeVideo(el as HTMLVideoElement);
        else
          el
            .querySelectorAll?.<HTMLVideoElement>('video')
            .forEach(observeVideo);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

/**
 * Manually pause every non-LiveKit video. Call this on route changes if
 * you want hard-stop behavior (e.g. leaving Reels for Profile).
 */
export function pauseAllVideosNow(): void {
  pauseAll();
}

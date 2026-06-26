/**
 * Lightweight image cache service-worker registration.
 *
 * Important: this file must not query Supabase or preload hundreds of remote
 * images at boot. Android WebView was spending the first 10–15 seconds fighting
 * this warmup storm, which made login and every page feel laggy.
 */
let registered = false;

export async function registerImageCacheSW(): Promise<void> {
  if (registered) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const host = window.location.hostname;
    if (host.startsWith('admin.')) return;
  } catch {
    // ignore
  }

  registered = true;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(async (r) => {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
      if (url.includes('/image-cache-sw.js')) {
        try { await r.unregister(); } catch { /* noop */ }
      }
    }));
  } catch {
    // best-effort only
  }

  if (!navigator.serviceWorker.controller) {
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    } catch {
      // best-effort; never block app startup
    }
  }
}

export async function warmAppImageCache(): Promise<void> {
  // Intentionally disabled: images are cached naturally when they enter view.
}
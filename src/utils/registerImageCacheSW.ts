/**
 * Image cache service worker warm-up helper (Pkg B).
 *
 * The unified service worker lives at /firebase-messaging-sw.js and handles:
 * 1. FCM background push notifications
 * 2. Same-origin asset caching (JS/CSS/fonts/images) — stale-while-revalidate
 * 3. Cross-origin image caching (avatars, banners, gifts, reels from Supabase/CDN) — cache-first
 *
 * This module only registers the SW if not already present, and sends WARM_IMAGES
 * to pre-populate the cross-origin image cache so even the first view is instant.
 */
import { supabase }  from '@/integrations/supabase/client';

let registered = false;

function postWarm(urls: string[]) {
  if (!urls.length) return;
  const send = (sw: ServiceWorker | null) => {
    if (sw) sw.postMessage({ type: 'WARM_IMAGES', urls });
  };
  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller);
    return;
  }
  navigator.serviceWorker.ready.then(reg => send(reg.active)).catch(() => {});
}

/** Browser-level preloads — works even when SW isn't ready yet. */
function preloadInBrowser(urls: string[]) {
  urls.forEach(u => {
    if (!u) return;
    try {
      const img = new Image();
      img.decoding = 'async';
      (img as any).fetchPriority = 'low';
      img.src = u;
    } catch {}
  });
}

export async function registerImageCacheSW(): Promise<void> {
  if (registered) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Skip only actual admin subdomains, NOT the main app domain.
  // Previous bug: host.startsWith('merilive.com') skipped production.
  try {
    const host = window.location.hostname;
    if (host.startsWith('admin.')) return;
  } catch {
    // ignore
  }

  registered = true;

  // Pkg B pass-2: unregister any stale /image-cache-sw.js registration from older builds
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(async (r) => {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
      if (url.indexOf('/image-cache-sw.js') !== -1) {
        try { await r.unregister(); } catch {}
      }
    }));
  } catch {}

  // If no SW is controlling yet, register the unified SW.
  // (FCM registers the same file later if push permission is granted.)
  if (!navigator.serviceWorker.controller) {
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    } catch (e) {
      // best-effort; do not block app
    }
  }
}

/**
 * Warm the image cache with critical app images at boot idle time.
 * Runs via requestIdleCallback so it never blocks first paint.
 */
export async function warmAppImageCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  const run = async () => {
    const urls = new Set<string>();
    const push = (v: any) => {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.add(v);
    };

    const queries: Promise<any>[] = [];
    const safe = async (fn: () => Promise<any>) => { try { await fn(); } catch {} };

    // Universal banners / campaigns (app + admin preview)
    queries.push(safe(async () => {
      const { data } = await supabase.from('entry_banners').select('image_url, animation_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => { push(r.image_url); push(r.animation_url); });
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('rating_banners').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('recharge_campaigns').select('banner_image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.banner_image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('banners').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));

    // Host / gift / frame assets that appear on home feed & profile
    queries.push(safe(async () => {
      const { data } = await supabase.from('gifts').select('image_url').eq('is_active', true).limit(50);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('vip_frames').select('image_url').eq('is_active', true).limit(30);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('role_frames').select('image_url').eq('is_active', true).limit(30);
      (data || []).forEach((r: any) => push(r.image_url));
    }));

    await Promise.allSettled(queries);

    const list = Array.from(urls);
    if (!list.length) return;

    // Browser preload (works immediately, even before SW activates)
    preloadInBrowser(list);
    // SW cache warm (persists across sessions)
    postWarm(list);
  };

  const idle = (cb: () => void) => {
    const w = window as any;
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(cb, { timeout: 4000 });
    } else {
      setTimeout(cb, 1200);
    }
  };
  idle(() => { run().catch(() => {}); });
}

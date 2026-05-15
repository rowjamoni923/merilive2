/**
 * Image cache service worker registration + warm-up helper.
 * Goal: every banner/photo loads in ~0ms after first view (cache-first SW)
 * + critical banners are warmed at app boot so even the first view is instant.
 */
import { supabase } from '@/integrations/supabase/client';

let registered = false;
let registration: ServiceWorkerRegistration | null = null;

export async function registerImageCacheSW(): Promise<void> {
  if (registered) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Don't register on admin panel host (keeps admin tools cleanly cache-busted)
  try {
    const host = window.location.hostname;
    if (host.startsWith('merilive.com') || host === 'merilive.com') {
      // admin host — skip
      return;
    }
  } catch {
    // ignore
  }
  registered = true;
  try {
    registration = await navigator.serviceWorker.register('/image-cache-sw.js', { scope: '/' });
  } catch (e) {
    // best-effort; do not block app
    return;
  }
}

function postWarm(urls: string[]) {
  if (!urls.length) return;
  const send = (sw: ServiceWorker | null) => {
    if (sw) sw.postMessage({ type: 'WARM_IMAGES', urls });
  };
  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller);
    return;
  }
  // Wait for activation
  navigator.serviceWorker.ready.then(reg => send(reg.active)).catch(() => {});
}

/** Browser-side preload via <link rel="preload"> + Image() — kicks fetch immediately. */
function preloadInBrowser(urls: string[]) {
  urls.forEach(u => {
    if (!u) return;
    try {
      const img = new Image();
      img.decoding = 'async';
      (img as any).fetchPriority = 'low';
      img.src = u;
    } catch {
      // ignore
    }
  });
}

/**
 * Warm cache with all visible app banners/popups/campaign images at boot.
 * Runs at idle so it never blocks first paint.
 */
export async function warmAppImageCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  const run = async () => {
    const urls = new Set<string>();
    const push = (v: any) => {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.add(v);
    };

    // Pull active banner-style assets in parallel. Each query is best-effort.
    const queries: Promise<any>[] = [];

    queries.push(
      supabase.from('event_popup_banners').select('image_url, banner_image_url').eq('is_active', true).limit(20)
        .then(({ data }) => (data || []).forEach((r: any) => { push(r.image_url); push(r.banner_image_url); }))
        .catch(() => {})
    );
    queries.push(
      supabase.from('payment_banners' as any).select('image_url').eq('is_active', true).limit(20)
        .then(({ data }) => (data || []).forEach((r: any) => push(r.image_url)))
        .catch(() => {})
    );
    queries.push(
      supabase.from('topup_campaigns' as any).select('banner_image_url, image_url').eq('is_active', true).limit(10)
        .then(({ data }) => (data || []).forEach((r: any) => { push(r.banner_image_url); push(r.image_url); }))
        .catch(() => {})
    );
    queries.push(
      supabase.from('app_banners' as any).select('image_url').eq('is_active', true).limit(20)
        .then(({ data }) => (data || []).forEach((r: any) => push(r.image_url)))
        .catch(() => {})
    );

    await Promise.allSettled(queries);

    const list = Array.from(urls);
    if (!list.length) return;
    // Browser-level preload (works even without SW)
    preloadInBrowser(list);
    // SW cache warm (instant on next view, persists across sessions)
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

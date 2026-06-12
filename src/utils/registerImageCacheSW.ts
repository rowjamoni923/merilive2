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
import { normalizePublicMediaUrl } from '@/lib/cdnImage';

let registered = false;

function postWarm(urls: string[]) {
  if (!urls.length) return;
  const chunked = urls.slice(0, 500);
  const send = (sw: ServiceWorker | null) => {
    if (sw) sw.postMessage({ type: 'WARM_IMAGES', urls: chunked });
  };
  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller);
    return;
  }
  navigator.serviceWorker.ready.then(reg => send(reg.active)).catch(() => {});
}

/** Browser-level preloads — works even when SW isn't ready yet. */
function preloadInBrowser(urls: string[]) {
  urls.slice(0, 96).forEach(u => {
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
    const push = (v: any, bucket = 'banners') => {
      const normalized = typeof v === 'string' ? normalizePublicMediaUrl(v, bucket) : undefined;
      if (normalized && /^https?:\/\//.test(normalized)) urls.add(normalized);
    };

    const queries: Promise<any>[] = [];
    const safe = async (fn: () => Promise<any>) => { try { await fn(); } catch {} };

    // Universal banners / campaigns (app + admin preview)
    queries.push(safe(async () => {
      // branding_settings is a key/value store — only `setting_value` exists.
      const { data } = await supabase.from('branding_settings').select('setting_value').limit(30);
      (data || []).forEach((r: any) => push(r.setting_value, 'branding'));
    }));
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
      const { data } = await supabase.from('first_recharge_bonus').select('banner_image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.banner_image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('banners').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      // onboarding_slides has no `background_url` column.
      const { data } = await supabase.from('onboarding_slides').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url, 'app-assets'));
    }));

    // Host / gift / frame assets that appear on home feed & profile
    queries.push(safe(async () => {
      const { data } = await supabase.from('gifts').select('icon_url, preview_url, animation_url').eq('is_active', true).limit(50);
      (data || []).forEach((r: any) => { push(r.icon_url); push(r.preview_url); push(r.animation_url); });
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('avatar_frames').select('frame_url, preview_url').eq('is_active', true).limit(30);
      (data || []).forEach((r: any) => { push(r.frame_url); push(r.preview_url); });
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('role_frames').select('frame_url, preview_url').eq('is_active', true).limit(30);
      (data || []).forEach((r: any) => { push(r.frame_url); push(r.preview_url); });
    }));

    // Pkg-NetFix: extended coverage so EVERY banner section the user sees on
    // first visit is already in cache — events, PK rewards, popup banners,
    // app theme (splash/home/login bg), party-room banners, VIP / noble
    // backgrounds (top-up + diamond store), shop items, admin notices.
    queries.push(safe(async () => {
      const { data } = await supabase.from('popup_event_banners').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('app_event_themes').select('splash_image_url, home_banner_url, login_bg_url').eq('is_active', true).limit(5);
      (data || []).forEach((r: any) => { push(r.splash_image_url, 'app-assets'); push(r.home_banner_url, 'banners'); push(r.login_bg_url, 'app-assets'); });
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('pk_reward_banners').select('banner_image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.banner_image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('pk_competitions').select('banner_image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.banner_image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('party_room_banners').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('party_room_backgrounds').select('image_url, thumbnail_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => { push(r.image_url); push(r.thumbnail_url); });
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('shop_items').select('image_url').eq('is_active', true).limit(40);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('vip_plans').select('profile_background_url').limit(20);
      (data || []).forEach((r: any) => push(r.profile_background_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('vip_tiers').select('profile_background_url').limit(20);
      (data || []).forEach((r: any) => push(r.profile_background_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('noble_cards').select('profile_background_url').limit(20);
      (data || []).forEach((r: any) => push(r.profile_background_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('admin_notices').select('image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('vehicle_entrances').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('entry_name_bars').select('image_url').eq('is_active', true).limit(20);
      (data || []).forEach((r: any) => push(r.image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('leaderboard_podium_frames').select('frame_image_url').eq('is_active', true).limit(10);
      (data || []).forEach((r: any) => push(r.frame_image_url));
    }));
    queries.push(safe(async () => {
      const { data } = await supabase.from('poster_images').select('image_url').limit(20);
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
  run().catch(() => {});
}

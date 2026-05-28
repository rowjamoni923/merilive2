/**
 * Bulk active-frame prewarm (Pkg-Instant).
 *
 * Fetches every active avatar_frame and role_frame asset at idle so frames
 * render with zero network delay anywhere they appear (Profile, Chat list +
 * message bubbles, Live, Party, Call, leaderboards, gift panels, shop, etc.).
 *
 * Bounded to 200 frames total to keep bandwidth/memory sane. Idempotent —
 * runs once per session.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchWithBinaryCache, prewarmSVGA } from '@/utils/svgaPrewarm';
import { fetchLottieCached } from '@/utils/lottieCache';

const MAX_FRAMES = 200;
let started = false;

function classify(url: string): 'svga' | 'lottie' | 'image' | 'video' | 'unknown' {
  if (!url || typeof url !== 'string') return 'unknown';
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.svga')) return 'svga';
  if (u.endsWith('.json')) return 'lottie';
  if (u.endsWith('.gif') || u.endsWith('.webp') || u.endsWith('.png') || u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image';
  if (u.endsWith('.mp4') || u.endsWith('.webm')) return 'video';
  return 'unknown';
}

function pushImageWarm(urls: string[]) {
  if (!urls.length) return;
  try {
    const sw = navigator.serviceWorker?.controller;
    if (sw) sw.postMessage({ type: 'WARM_IMAGES', urls });
  } catch { /* ignore */ }
}

export async function prewarmActiveFrames(): Promise<void> {
  if (started) return;
  if (typeof window === 'undefined') return;
  started = true;

  try {
    prewarmSVGA();

    const [avatarRes, roleRes] = await Promise.allSettled([
      supabase
        .from('avatar_frames')
        .select('frame_url')
        .eq('is_active', true)
        .order('min_level', { ascending: true })
        .limit(MAX_FRAMES),
      supabase
        .from('role_frames')
        .select('frame_url')
        .eq('is_active', true)
        .limit(MAX_FRAMES),
    ]);

    const urls = new Set<string>();
    const collect = (rows: any) => {
      if (!Array.isArray(rows)) return;
      for (const r of rows) {
        const u = r?.frame_url;
        if (typeof u === 'string' && u.startsWith('http')) urls.add(u);
      }
    };
    if (avatarRes.status === 'fulfilled') collect(avatarRes.value.data);
    if (roleRes.status === 'fulfilled') collect(roleRes.value.data);

    const svgaUrls: string[] = [];
    const lottieUrls: string[] = [];
    const imageUrls: string[] = [];

    for (const url of urls) {
      switch (classify(url)) {
        case 'svga': svgaUrls.push(url); break;
        case 'lottie': lottieUrls.push(url); break;
        case 'image': imageUrls.push(url); break;
        default: break;
      }
    }

    // Image frames → service-worker warm (cheap, batched)
    pushImageWarm(imageUrls);

    // SVGA binaries → Cache API. Serial to avoid bandwidth burst.
    for (const url of svgaUrls.slice(0, 80)) {
      try { await fetchWithBinaryCache(url); } catch { /* ignore */ }
    }

    // Lottie JSON → in-memory cache.
    await Promise.allSettled(
      lottieUrls.slice(0, 80).map((u) => fetchLottieCached(u).catch(() => null)),
    );
  } catch {
    // best-effort only
  }
}

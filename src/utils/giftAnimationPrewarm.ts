/**
 * Gift animation prewarm (Pkg C).
 *
 * Fetches the top active gifts at idle time and pre-loads their animation
 * assets so the first gift-send / receive plays instantly:
 *   - SVGA binaries → cached via svgaPrewarm Cache API
 *   - Lottie JSON   → parsed + put in lottieCache
 *   - GIF/WebP/PNG  → handed to the unified image SW (WARM_IMAGES)
 *   - MP4/WebM      → skipped (too big to prefetch eagerly)
 *
 * Runs once per session, bounded to ~25 assets so memory + bandwidth stay sane.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchWithBinaryCache, prewarmSVGA } from '@/utils/svgaPrewarm';
import { fetchLottieCached } from '@/utils/lottieCache';

const MAX_GIFTS = 25;
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
  } catch {}
}

export async function prewarmGiftAnimations(): Promise<void> {
  if (started) return;
  if (typeof window === 'undefined') return;
  started = true;

  try {
    // Ensure svgaplayerweb module is in memory before we touch binaries
    prewarmSVGA();

    const { data, error } = await supabase
      .from('gifts')
      .select('icon_url, animation_url, svga_url, lottie_url, preview_url')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .limit(MAX_GIFTS);
    if (error || !Array.isArray(data)) return;

    const imageUrls: string[] = [];
    const svgaUrls: string[] = [];
    const lottieUrls: string[] = [];
    for (const row of data as any[]) {
      const candidates = [row.svga_url, row.lottie_url, row.animation_url, row.icon_url, row.preview_url].filter(Boolean) as string[];
      for (const url of candidates) {
        switch (classify(url)) {
          case 'svga': svgaUrls.push(url); break;
          case 'lottie': lottieUrls.push(url); break;
          case 'image': imageUrls.push(url); break;
          default: break;
        }
      }
    }

    // Image SW warm (fire-and-forget, message API handles batching)
    pushImageWarm(imageUrls);

    // SVGA binaries → Cache API (bounded, serial to avoid bandwidth spike)
    for (const url of svgaUrls.slice(0, 12)) {
      try { await fetchWithBinaryCache(url); } catch {}
    }

    // Lottie JSON → in-memory cache (bounded)
    await Promise.allSettled(
      lottieUrls.slice(0, 12).map(u => fetchLottieCached(u).catch(() => null))
    );
  } catch {
    // best-effort only
  }
}

/**
 * Gift animation prewarm (Pkg C).
 *
 * Fetches the top active gifts at idle time and pre-loads their animation
 * assets so the first gift-send / receive plays instantly:
 *   - SVGA binaries → cached via svgaPrewarm Cache API
 *   - Lottie JSON   → parsed + put in lottieCache
 *   - GIF/WebP/PNG  → handed to the unified image SW (WARM_IMAGES)
 *   - MP4/WebM/VAP  → top files warmed into HTTP cache for instant first play
 *
 * Runs once per session, bounded to ~25 assets so memory + bandwidth stay sane.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchWithBinaryCache, prewarmSVGA, prewarmPopularAssets } from '@/utils/svgaPrewarm';
import { fetchLottieCached } from '@/utils/lottieCache';
import { markVapCompositeHint } from '@/utils/vapDetection';
import { warmupVapUrls } from '@/utils/vapWarmup';

const MAX_GIFTS = 60;
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

    // Pkg C pass-3 — popularity-ranked prewarm via SECDEF RPC
    // (top sends over last 7d, falls back to display_order). Avoids
    // exposing gift_transactions to clients and skews prewarm toward
    // the gifts users actually see/send most often.
    let rows: any[] | null = null;
    try {
      const { data, error } = await supabase.rpc('get_popular_gift_assets', { _limit: MAX_GIFTS });
      if (!error && Array.isArray(data)) rows = data;
    } catch {}

    // Fallback: legacy display_order ranking if RPC missing/blocked
    if (!rows) {
      const { data, error } = await supabase
        .from('gifts')
        .select('icon_url, animation_url, svga_url, lottie_url, preview_url')
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .limit(MAX_GIFTS);
      if (error || !Array.isArray(data)) return;
      rows = data;
    }

    const imageUrls: string[] = [];
    const svgaUrls: string[] = [];
    const lottieUrls: string[] = [];
    const videoUrls: string[] = [];
    for (const row of rows as any[]) {
      const candidates = [row.svga_url, row.lottie_url, row.animation_url, row.icon_url, row.preview_url].filter(Boolean) as string[];
      for (const url of candidates) {
        switch (classify(url)) {
          case 'svga': svgaUrls.push(url); break;
          case 'lottie': lottieUrls.push(url); break;
          case 'image': imageUrls.push(url); break;
          case 'video': videoUrls.push(url); break;
          default: break;
        }
      }
    }

    for (const row of rows as any[]) {
      const fmt = String(row.animation_format || row.animation_type || '').toLowerCase();
      if (fmt === 'vap' && row.animation_url) markVapCompositeHint(row.animation_url, true);
    }


    // Image SW warm (fire-and-forget, message API handles batching)
    pushImageWarm(imageUrls);

    // SVGA binaries → Cache API + PRE-PARSE (Zero-delay CPU logic)
    if (svgaUrls.length > 0) {
      prewarmPopularAssets(svgaUrls.slice(0, 20));
    }

    // Lottie JSON → in-memory cache (bounded)
    await Promise.allSettled(
      lottieUrls.slice(0, 12).map(u => fetchLottieCached(u).catch(() => null))
    );

    // MP4/WebM/VAP files caused the real first-play delay. Warm only the most
    // popular few fully into HTTP cache; metadata warm keeps the decoder ready.
    const criticalVideos = videoUrls.slice(0, 10);
    warmupVapUrls(criticalVideos, { warmJsonSibling: false });
    criticalVideos.forEach((u) => warmVideoMetadata(u));
  } catch {
    // best-effort only
  }
}

function warmVideoMetadata(url: string) {
  if (typeof document === 'undefined') return;
  try {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.src = url;
    const cleanup = () => { v.removeAttribute('src'); try { v.load(); } catch {} };
    v.onloadedmetadata = () => cleanup();
    v.onerror = () => cleanup();
    v.load();
  } catch {}
}

/**
 * Pkg C pass-2 — prewarm a caller-supplied list of gift asset URLs.
 * Called when GiftPanel opens so every visible gift is buttery-smooth on first tap.
 * Bounded, idempotent (per-URL caches already dedupe).
 */
const sessionPrewarmed = new Set<string>();
export async function prewarmGiftAssets(urls: Array<string | null | undefined>): Promise<void> {
  if (typeof window === 'undefined') return;
  prewarmSVGA(); // ensure module is in memory

  const svgaUrls: string[] = [];
  const lottieUrls: string[] = [];
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    if (sessionPrewarmed.has(raw)) continue;
    sessionPrewarmed.add(raw);
    switch (classify(raw)) {
      case 'svga': svgaUrls.push(raw); break;
      case 'lottie': lottieUrls.push(raw); break;
      case 'image': imageUrls.push(raw); break;
      case 'video': videoUrls.push(raw); break;
      default: break;
    }
  }

  if (imageUrls.length) pushImageWarm(imageUrls);

  // Hard caps so opening a category with 200 gifts does not flood the network
  const svgaCap = Math.min(svgaUrls.length, 20);
  for (let i = 0; i < svgaCap; i++) {
    try { await fetchWithBinaryCache(svgaUrls[i]); } catch {}
  }
  await Promise.allSettled(
    lottieUrls.slice(0, 20).map(u => fetchLottieCached(u).catch(() => null))
  );
  const criticalVideos = videoUrls.slice(0, 8);
  warmupVapUrls(criticalVideos, { warmJsonSibling: false });
  criticalVideos.forEach((u) => warmVideoMetadata(u));
}

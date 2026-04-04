/**
 * Robust SVGA Loader - OPTIMIZED FOR INSTANT LOADING
 * 
 * Features:
 * - Browser Cache API for persistent binary caching (survives page reload)
 * - Pre-warmed svgaplayerweb module (no dynamic import delay)
 * - 3 retries with exponential backoff
 * - 120s timeout for large files (50MB+)
 * - Deduplication: concurrent loads for same URL share one promise
 * - Global in-memory cache for parsed VideoItems
 * - R2 proxy support
 */

import { getProxiedUrl, needsProxy } from '@/utils/r2ProxyUrl';
import { svgaCacheGet, svgaCacheSet } from '@/utils/svgaCache';
import { getSVGAModule, fetchWithBinaryCache } from '@/utils/svgaPrewarm';

// In-flight request deduplication
const inflight = new Map<string, Promise<any>>();

const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;

async function parseSingle(SVGA: any, url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SVGA parse timeout')), TIMEOUT_MS);
    try {
      const parser = new SVGA.Parser();
      parser.load(url, (item: any) => {
        clearTimeout(timeout);
        if (item) resolve(item);
        else reject(new Error('SVGA parse returned null'));
      }, (err: any) => {
        clearTimeout(timeout);
        reject(err || new Error('SVGA load failed'));
      });
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

/**
 * Load an SVGA file with full retry, caching, and deduplication.
 * Returns the VideoItem (never null).
 * 
 * Loading order:
 * 1. In-memory cache (instant, <1ms)
 * 2. Browser Cache API binary → parse (fast, <200ms)
 * 3. Network fetch → parse → cache (first load only)
 */
export async function loadSVGA(originalUrl: string): Promise<any> {
  if (!originalUrl) throw new Error('No SVGA URL provided');

  // 1. In-memory cache - instant
  const cached = svgaCacheGet(originalUrl);
  if (cached) return cached;

  // 2. Deduplicate concurrent requests
  const existing = inflight.get(originalUrl);
  if (existing) return existing;

  const loadUrl = needsProxy(originalUrl) ? getProxiedUrl(originalUrl) : originalUrl;

  const promise = (async () => {
    // Pre-warmed module - no dynamic import delay
    const SVGA = await getSVGAModule();

    let lastError: any = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Try Browser Cache first, then network
        const binaryUrl = await fetchWithBinaryCache(loadUrl);
        const item = await parseSingle(SVGA, binaryUrl);
        
        // Clean up blob URL if created
        if (binaryUrl !== loadUrl && binaryUrl.startsWith('blob:')) {
          // Don't revoke immediately - parser may still need it briefly
          setTimeout(() => URL.revokeObjectURL(binaryUrl), 5000);
        }
        
        svgaCacheSet(originalUrl, item);
        return item;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError || new Error('SVGA load failed after retries');
  })();

  inflight.set(originalUrl, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    inflight.delete(originalUrl);
  }
}

/**
 * Preload an SVGA into cache without rendering.
 */
export async function preloadSVGA(url: string): Promise<void> {
  try {
    await loadSVGA(url);
  } catch (e) {
    console.warn('[SVGA] Preload failed:', url.split('/').pop(), e);
  }
}

/**
 * Strip audio from a VideoItem (returns shallow copy, never mutates original).
 */
export function stripAudio(videoItem: any): any {
  if (!videoItem) return videoItem;
  const copy = { ...videoItem };
  if (copy.audios?.length > 0) copy.audios = [];
  if (copy.audiosMap) copy.audiosMap = {};
  return copy;
}

/**
 * SVGA Pre-Warming - OPTIMIZED FOR 0-SECOND LOAD
 * 
 * Features:
 * - Pre-imports svgaplayerweb module
 * - Browser Cache API for raw binaries
 * - Pre-parsing of popular assets into VideoItems
 */

import { svgaCacheSet, svgaCacheHas } from './svgaCache';

let svgaModule: any = null;
let modulePromise: Promise<any> | null = null;

/**
 * Pre-import svgaplayerweb module
 */
export function prewarmSVGA(): void {
  if (svgaModule || modulePromise) return;
  modulePromise = import('svgaplayerweb')
    .then(m => { svgaModule = m; return m; })
    .catch(() => { modulePromise = null; });
}

/**
 * Get module with pre-warm check
 */
export async function getSVGAModule(): Promise<any> {
  if (svgaModule) return svgaModule;
  if (modulePromise) return modulePromise;
  modulePromise = import('svgaplayerweb').then(m => { svgaModule = m; return m; });
  return modulePromise;
}

/**
 * PRE-PARSE POPULAR ASSETS
 * Call this when joining a room to ensure popular gifts play instantly (0ms CPU delay).
 */
export async function prewarmPopularAssets(urls: string[]): Promise<void> {
  if (!urls.length) return;
  
  const SVGA = await getSVGAModule();
  const parser = new SVGA.Parser();

  // Load and parse in background
  urls.forEach(url => {
    if (svgaCacheHas(url)) return;
    
    parser.load(url, (videoItem: any) => {
      if (videoItem) {
        svgaCacheSet(url, videoItem);
        console.log('[SVGA-Prewarm] ✅ Parsed popular asset:', url.split('/').pop());
      }
    }, (err: any) => {
      console.warn('[SVGA-Prewarm] ❌ Failed to pre-parse:', url.split('/').pop(), err);
    });
  });
}

// ---- Browser Cache API (unchanged but integrated) ----

const CACHE_NAME = 'svga-binary-v1';
let cacheInstance: Cache | null = null;

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error('SVGA FileReader failed'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(blob);
});

async function getCache(): Promise<Cache | null> {
  if (cacheInstance) return cacheInstance;
  try {
    cacheInstance = await caches.open(CACHE_NAME);
    return cacheInstance;
  } catch {
    return null;
  }
}

export async function fetchWithBinaryCache(url: string): Promise<string> {
  const cache = await getCache();
  if (cache) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        const blob = await cached.blob();
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          return URL.createObjectURL(blob);
        }
        return await blobToDataUrl(blob);
      }
    } catch {}
  }

  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (response.ok && cache) {
      cache.put(url, response.clone()).catch(() => {});
      const blob = await response.blob();
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob);
      }
      return await blobToDataUrl(blob);
    }
    if (response.ok) {
      const blob = await response.blob();
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob);
      }
      return await blobToDataUrl(blob);
    }
  } catch {}

  return url;
}

/**
 * SVGA Pre-Warming
 * 
 * Pre-imports the svgaplayerweb library at app startup
 * so it's ready instantly when first SVGA animation plays.
 * Also opens the Browser Cache for instant binary retrieval.
 */

let svgaModule: any = null;
let modulePromise: Promise<any> | null = null;

/**
 * Pre-import svgaplayerweb so subsequent loadSVGA calls are instant.
 * Call this once at app startup.
 */
export function prewarmSVGA(): void {
  if (svgaModule || modulePromise) return;
  modulePromise = import('svgaplayerweb')
    .then(m => { svgaModule = m; return m; })
    .catch(() => { modulePromise = null; });
}

/**
 * Get the pre-imported SVGA module (falls back to dynamic import).
 */
export async function getSVGAModule(): Promise<any> {
  if (svgaModule) return svgaModule;
  if (modulePromise) return modulePromise;
  modulePromise = import('svgaplayerweb').then(m => { svgaModule = m; return m; });
  return modulePromise;
}

// ---- Browser Cache API for raw SVGA binaries ----

const CACHE_NAME = 'svga-binary-v1';
let cacheInstance: Cache | null = null;

async function getCache(): Promise<Cache | null> {
  if (cacheInstance) return cacheInstance;
  try {
    cacheInstance = await caches.open(CACHE_NAME);
    return cacheInstance;
  } catch {
    return null; // Cache API not available
  }
}

/**
 * Check if SVGA binary is in Browser Cache.
 * Returns a blob URL if cached, null otherwise.
 */
export async function getCachedBinaryUrl(url: string): Promise<string | null> {
  const cache = await getCache();
  if (!cache) return null;
  try {
    const response = await cache.match(url);
    if (response) return url; // Cache API will serve it directly
    return null;
  } catch {
    return null;
  }
}

/**
 * Store SVGA binary response in Browser Cache for future instant loads.
 */
export async function cacheBinaryResponse(url: string, response: Response): Promise<void> {
  const cache = await getCache();
  if (!cache) return;
  try {
    await cache.put(url, response.clone());
  } catch {
    // Quota exceeded or other error - silently fail
  }
}

/**
 * Fetch SVGA binary with Browser Cache (cache-first strategy).
 * Returns the URL to use for parser.load().
 */
export async function fetchWithBinaryCache(url: string): Promise<string> {
  const cache = await getCache();
  if (cache) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        // Return blob URL from cached response for instant access
        const blob = await cached.blob();
        return URL.createObjectURL(blob);
      }
    } catch {}
  }

  // Not cached - fetch and cache
  try {
    const response = await fetch(url);
    if (response.ok && cache) {
      // Clone before consuming
      const clone = response.clone();
      cache.put(url, clone).catch(() => {});
    }
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch {}

  // Fallback: return original URL for parser to fetch
  return url;
}

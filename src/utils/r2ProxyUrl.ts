/**
 * R2 URL Handler - Proxies R2 files to bypass CORS
 * 
 * Uses our edge function to proxy R2 files since direct
 * access may have CORS issues depending on bucket config.
 */

const SUPABASE_PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID;

/**
 * Convert R2 URLs to proxied URLs to bypass CORS
 */
export const getProxiedUrl = (originalUrl: string): string => {
  if (!originalUrl) return originalUrl;
  
  // Check if it's any R2 URL pattern
  const isR2Url = /pub-[a-z0-9]+\.r2\.dev/i.test(originalUrl) ||
                  originalUrl.includes('r2.cloudflarestorage.com') ||
                  originalUrl.includes('.r2.dev');
  
  if (!isR2Url) {
    // Not an R2 URL, return as is
    return originalUrl;
  }
  
  // Proxy through our edge function
  const proxyUrl = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/r2-proxy?url=${encodeURIComponent(originalUrl)}`;
  
  return proxyUrl;
};

/**
 * Check if a URL is an R2 URL
 */
export const needsProxy = (url: string): boolean => {
  if (!url) return false;
  
  return /pub-[a-z0-9]+\.r2\.dev/i.test(url) ||
         url.includes('r2.cloudflarestorage.com') ||
         url.includes('.r2.dev');
};

/**
 * Fetch file via proxy
 */
export const fetchViaProxy = async (originalUrl: string): Promise<Response> => {
  const proxyUrl = getProxiedUrl(originalUrl);
  
  const response = await fetch(proxyUrl);
  
  if (!response.ok) {
    throw new Error(`Proxy fetch failed: ${response.status}`);
  }
  
  return response;
};

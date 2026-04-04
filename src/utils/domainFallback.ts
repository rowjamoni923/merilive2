/**
 * Domain Fallback System
 * Tries primary domain first, falls back to secondary if unreachable
 * Works for Capacitor native apps to handle SSL/domain issues
 */

const PRIMARY_DOMAIN = 'https://merilive.com';
const FALLBACK_DOMAIN = 'https://www.merilive.com';
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

/**
 * Check if a domain is reachable
 */
async function isDomainReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    // In no-cors mode, we get an opaque response (type: 'opaque', status: 0)
    // But if fetch doesn't throw, the domain is reachable
    return true;
  } catch (error) {
    console.warn(`[DomainFallback] ${url} unreachable:`, error);
    return false;
  }
}

/**
 * Find the best working domain and redirect
 * Called only on native platforms
 */
export async function initDomainFallback(): Promise<void> {
  // Don't redirect if already on the target domain
  const currentHost = window.location.hostname;
  if (currentHost === 'merilive.com' || currentHost === 'www.merilive.com') {
    console.log('[DomainFallback] Already on target domain:', currentHost);
    return;
  }

  console.log('[DomainFallback] Checking primary domain...');
  
  // Try primary domain first
  const primaryOk = await isDomainReachable(PRIMARY_DOMAIN);
  if (primaryOk) {
    console.log('[DomainFallback] Primary domain OK, redirecting to:', PRIMARY_DOMAIN);
    window.location.href = PRIMARY_DOMAIN;
    return;
  }

  console.log('[DomainFallback] Primary failed, trying fallback...');
  
  // Try fallback domain
  const fallbackOk = await isDomainReachable(FALLBACK_DOMAIN);
  if (fallbackOk) {
    console.log('[DomainFallback] Fallback domain OK, redirecting to:', FALLBACK_DOMAIN);
    window.location.href = FALLBACK_DOMAIN;
    return;
  }

  // Both failed - stay on local, retry after delay
  console.warn('[DomainFallback] Both domains unreachable. Retrying in 10s...');
  setTimeout(() => initDomainFallback(), 10000);
}

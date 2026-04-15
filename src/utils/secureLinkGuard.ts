/**
 * 🔒 SECURE LINK GUARD
 * Controls which external links are allowed inside the native app.
 * Fetches whitelist from admin-managed `allowed_external_links` table.
 * Blocks all unauthorized external URLs to prevent phishing & data leaks.
 */

import { supabase } from '@/integrations/supabase/client';

interface AllowedLinkRule {
  url_pattern: string;
  link_type: string; // 'domain' | 'exact_url' | 'prefix'
}

// Cached allowed links from database
let cachedRules: AllowedLinkRule[] = [];
let cacheLoaded = false;

// Hardcoded fallback (always allowed even if DB fails)
const FALLBACK_DOMAINS = [
  'merilive.com',
  'play.google.com',
  'lovable.app',
  'lovableproject.com',
  'supabase.co',
];

// Internal app routes - always allowed
const INTERNAL_PREFIXES = ['/', '#', 'mailto:', 'tel:'];

/**
 * Fetch allowed links from database
 */
const fetchAllowedLinks = async (): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('allowed_external_links')
      .select('url_pattern, link_type')
      .eq('is_active', true);

    if (!error && data) {
      cachedRules = data as AllowedLinkRule[];
      cacheLoaded = true;
      console.log(`[SecureLinkGuard] Loaded ${cachedRules.length} allowed link rules`);
    }
  } catch (err) {
    console.error('[SecureLinkGuard] Failed to fetch rules:', err);
  }
};

/**
 * Check if a URL matches against a rule
 */
const matchesRule = (url: string, rule: AllowedLinkRule): boolean => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const fullUrl = urlObj.href.toLowerCase();
    const pattern = rule.url_pattern.toLowerCase();

    switch (rule.link_type) {
      case 'domain':
        return hostname === pattern || hostname.endsWith('.' + pattern);
      case 'exact_url':
        return fullUrl === pattern || fullUrl === pattern + '/';
      case 'prefix':
        return fullUrl.startsWith(pattern);
      default:
        return hostname === pattern || hostname.endsWith('.' + pattern);
    }
  } catch {
    return false;
  }
};

/**
 * Check if a URL is allowed to open
 */
export const isUrlAllowed = (url: string): boolean => {
  if (!url) return false;

  // Always allow internal/relative links
  if (INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix) && !url.startsWith('//'))) {
    return true;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check fallback domains (always allowed)
    if (FALLBACK_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return true;
    }

    // Check DB rules
    if (cacheLoaded && cachedRules.length > 0) {
      return cachedRules.some(rule => matchesRule(url, rule));
    }

    // If cache not loaded yet, only allow fallback domains
    return false;
  } catch {
    return false;
  }
};

/**
 * Get the blocked reason for logging
 */
export const getBlockedReason = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return `Blocked unauthorized domain: ${urlObj.hostname}`;
  } catch {
    return `Blocked invalid URL: ${url.substring(0, 50)}`;
  }
};

/**
 * Initialize the global link interceptor for native apps.
 * Fetches rules from DB and intercepts all external link clicks.
 */
export const initSecureLinkGuard = (): (() => void) => {
  // Fetch rules immediately
  fetchAllowedLinks();

  // Refresh rules periodically (every 5 minutes)
  const refreshInterval = setInterval(fetchAllowedLinks, 5 * 60 * 1000);

  // Subscribe to real-time changes
  const channel = supabase
    .channel('secure-link-guard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'allowed_external_links' }, () => {
      console.log('[SecureLinkGuard] Rules updated, refreshing...');
      fetchAllowedLinks();
    })
    .subscribe();

  const handleClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest('a');
    if (!target) return;

    const href = target.getAttribute('href');
    if (!href) return;

    // Skip internal navigation
    if (href.startsWith('/') && !href.startsWith('//')) return;
    if (href.startsWith('#')) return;

    // Check external URLs
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      if (!isUrlAllowed(href)) {
        e.preventDefault();
        e.stopPropagation();
        console.warn(`[SecureLinkGuard] ${getBlockedReason(href)}`);
        return;
      }
    }
  };

  // Capture phase to intercept before any handler
  document.addEventListener('click', handleClick, true);

  // Intercept window.open
  const originalWindowOpen = window.open;
  window.open = function (url?: string | URL, ...args: any[]) {
    const urlStr = url?.toString() || '';
    if (urlStr && !isUrlAllowed(urlStr)) {
      console.warn(`[SecureLinkGuard] Blocked window.open: ${getBlockedReason(urlStr)}`);
      return null;
    }
    return originalWindowOpen.call(window, url, ...args);
  };

  // Cleanup
  return () => {
    document.removeEventListener('click', handleClick, true);
    window.open = originalWindowOpen;
    clearInterval(refreshInterval);
    supabase.removeChannel(channel);
  };
};

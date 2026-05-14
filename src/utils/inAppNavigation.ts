/**
 * In-App Navigation Utility
 * All URLs open inside the app — nothing goes to external browser
 * 
 * Play Store → Android market:// intent (opens in Play Store app)
 * Internal routes → window.location.href (stays in WebView)
 * Payment/External → Capacitor Browser in-app overlay
 */

import { Capacitor } from '@capacitor/core';

const INTERNAL_DOMAINS = [
  'merilive.com',
  'www.merilive.com',
  'merilive.top',
  'merilive.lovable.app',
  new URL(import.meta.env.VITE_SUPABASE_URL).hostname,
];

const PLAY_STORE_PACKAGE = 'com.merilive.app';

/**
 * Check if URL is an internal app route
 */
function isInternalUrl(url: string): boolean {
  try {
    // Relative URLs are always internal
    if (url.startsWith('/')) return true;
    
    const parsed = new URL(url);
    return INTERNAL_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return true; // If can't parse, treat as internal
  }
}

/**
 * Check if URL is a Play Store link
 */
function isPlayStoreUrl(url: string): boolean {
  return url.includes('play.google.com/store') || url.includes('market://');
}

/**
 * Open Play Store via Android native intent (opens Play Store app, not browser)
 */
function openPlayStoreNative(): void {
  // market:// scheme triggers Android Intent resolver → opens Play Store APP
  // (not in-app WebView). `_blank` in Capacitor Android routes through the
  // system intent handler so the user leaves our WebView entirely.
  const marketUrl = `market://details?id=${PLAY_STORE_PACKAGE}`;
  const fallbackUrl = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

  try {
    const win = window.open(marketUrl, '_blank');
    if (!win) {
      // Some Android WebViews return null but still dispatch the intent.
      // If nothing happens, fall back to https Play Store link via system.
      window.open(fallbackUrl, '_blank');
    }
  } catch {
    try {
      window.open(fallbackUrl, '_blank');
    } catch {
      window.location.href = fallbackUrl;
    }
  }
}

/**
 * Open URL inside the app — NEVER opens external Chrome/browser
 * 
 * @param url - URL to open
 * @param options - Optional settings
 */
export async function openInApp(url: string, options?: { 
  /** Force in-app browser overlay (for payment gateways) */
  useOverlay?: boolean;
}): Promise<void> {
  const isNative = Capacitor.isNativePlatform();
  
  // === Play Store URLs → Open Play Store app directly ===
  if (isPlayStoreUrl(url)) {
    if (isNative) {
      openPlayStoreNative();
    } else {
      window.open(url, '_blank');
    }
    return;
  }

  // === Internal URLs → Navigate within WebView ===
  if (isInternalUrl(url) && !options?.useOverlay) {
    if (url.startsWith('/')) {
      window.location.href = url;
    } else {
      try {
        const parsed = new URL(url);
        // Extract path and navigate internally
        window.location.href = parsed.pathname + parsed.search + parsed.hash;
      } catch {
        window.location.href = url;
      }
    }
    return;
  }

  // === External URLs (payment gateways etc.) → In-App Browser overlay ===
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      // presentationStyle: 'popover' keeps it as an in-app overlay
      // toolbarColor matches our app theme
      await Browser.open({ 
        url,
        presentationStyle: 'popover',
        toolbarColor: '#0a0a0f',
      });
    } catch (error) {
      console.error('[InAppNav] Browser plugin error, using location:', error);
      window.location.href = url;
    }
  } else {
    // Web: open in same window for payment callbacks
    window.open(url, '_blank');
  }
}

/**
 * Open external link (WhatsApp, Telegram, etc.)
 * These should open in their respective apps on native
 */
export async function openExternalApp(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Android will handle wa.me/t.me via native intent
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

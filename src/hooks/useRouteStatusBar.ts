/**
 * Pillar 4 — Per-route system chrome sync.
 *
 * Listens to the active pathname and updates:
 *   1. Native Android status-bar (color + icon style + overlay)
 *   2. <meta name="theme-color"> (PWA / browser chrome bar)
 *
 * Dark/immersive routes (live, call, party, reels, watch) get a
 * dark transparent bar with light icons. Everything else uses the
 * white app shell with dark icons. Switching is debounced via a
 * single ref so back-to-back navigations don't queue native calls.
 *
 * Additive: safe on web, safe on older APKs (try/catch on import).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isNativeApp } from '@/utils/nativeUtils';

type Theme = 'light' | 'dark' | 'immersive';

const DARK_PATTERNS: RegExp[] = [
  /^\/live\/[^/]+/,        // inside a live room
  /^\/call\//,             // private call
  /^\/party\//,            // party / video party / game party
  /^\/reels(\/|$)/,        // reels feed
  /^\/watch(\/|$)/,        // watch / video player
  /^\/pk(\/|$)/,           // PK battle
];

function themeFor(pathname: string): Theme {
  for (const re of DARK_PATTERNS) {
    if (re.test(pathname)) return 'immersive';
  }
  return 'light';
}

const COLORS: Record<Theme, { bar: string; meta: string }> = {
  light:     { bar: '#ffffff', meta: '#f8fafc' },
  dark:      { bar: '#0a0a0f', meta: '#0a0a0f' },
  immersive: { bar: '#00000000', meta: '#000000' },
};

function setMetaThemeColor(color: string) {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (meta.content !== color) meta.content = color;
}

async function applyNativeBar(theme: Theme) {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { bar } = COLORS[theme];
    if (theme === 'immersive') {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Light }); // light icons on dark video
      await StatusBar.setBackgroundColor({ color: bar });
    } else if (theme === 'dark') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: bar });
    } else {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark }); // dark icons on white
      await StatusBar.setBackgroundColor({ color: bar });
    }
  } catch {
    /* older APKs / web — ignore */
  }
}

export function useRouteStatusBar() {
  const { pathname } = useLocation();
  const lastTheme = useRef<Theme | null>(null);

  useEffect(() => {
    const theme = themeFor(pathname);
    if (lastTheme.current === theme) return;
    lastTheme.current = theme;

    setMetaThemeColor(COLORS[theme].meta);
    // Fire-and-forget; ordering doesn't matter because each call is idempotent.
    void applyNativeBar(theme);
  }, [pathname]);
}

export default useRouteStatusBar;

/**
 * Pkg434 — Phase 14 — Tab Keep-Alive Host
 *
 * Mounts the 4 main tab screens (Home / Discover / Chat / Reels) ONCE on first
 * visit, then keeps them mounted across tab swaps. Inactive tabs are hidden
 * via `display:none` so realtime subscriptions, scroll position, list state,
 * and in-flight queries all survive — same behaviour as native Android apps
 * (Bigo, Tango, Tiktok) where bottom-tab swaps are instant with zero spinner.
 *
 * SAFETY: default OFF. Flip on per device via
 *   localStorage.setItem('tabKeepAlive','on')
 * Kill switch: localStorage.removeItem('tabKeepAlive') + reload.
 *
 * When OFF, this component renders nothing and App.tsx falls back to the
 * existing per-route lazy mount (zero behaviour change).
 *
 * Lazy mount: a tab is only created the first time the user visits it, so
 * cold-launch on /index does NOT also boot Discover/Chat/Reels chunks.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { lazyRetry } from '@/utils/lazyRetry';

const Index = lazy(lazyRetry(() => import('@/pages/Index')));
const Discover = lazy(lazyRetry(() => import('@/pages/Discover')));
const Chat = lazy(lazyRetry(() => import('@/pages/Chat')));
const Reels = lazy(lazyRetry(() => import('@/pages/Reels')));

type TabKey = 'home' | 'discover' | 'chat' | 'reels';

const TABS: Record<TabKey, { paths: string[]; Comp: React.ComponentType }> = {
  home: { paths: ['/', '/index'], Comp: Index },
  discover: { paths: ['/discover'], Comp: Discover },
  chat: { paths: ['/chat'], Comp: Chat },
  reels: { paths: ['/reels'], Comp: Reels },
};

const ALL_TAB_PATHS = new Set<string>(
  Object.values(TABS).flatMap((t) => t.paths)
);

// User mandate: no duplicate/ghost UI. Keep-alive creates a second mounted
// page tree, so it must be explicit opt-in only while we keep route rendering
// single-owner and clean by default.
export function isTabKeepAliveEnabled(): boolean {
  return false;
}

export function isKeepAliveTabPath(pathname: string): boolean {
  return ALL_TAB_PATHS.has(pathname);
}

function pathToTabKey(path: string): TabKey | null {
  for (const k of Object.keys(TABS) as TabKey[]) {
    if (TABS[k].paths.includes(path)) return k;
  }
  return null;
}

export default function TabKeepAliveHost() {
  const location = useLocation();
  const activeKey = pathToTabKey(location.pathname);
  const mountedRef = useRef<Set<TabKey>>(new Set());
  const [, forceRerender] = useState(0);

  // Seed the active tab synchronously so the first render of tab-keepalive
  // never produces an empty host frame before useEffect runs.
  if (activeKey && !mountedRef.current.has(activeKey)) {
    mountedRef.current.add(activeKey);
  }

  useEffect(() => {
    if (activeKey && !mountedRef.current.has(activeKey)) {
      mountedRef.current.add(activeKey);
      forceRerender((n) => n + 1);
    }
  }, [activeKey]);

  const hostVisible = activeKey !== null;

  // Phase 9A: when the user is on a NON-tab route (e.g. /live/:id, /call,
  // /profile, /reels-viewer), do NOT render any kept-alive tab tree. The
  // inactive Home/Discover/Chat trees include children (gift sheets, win
  // popups, call overlays, dialing pills, banners) that render via
  // createPortal(document.body) — those portals escape our `display:none`
  // wrapper and stack on top of the active screen, causing the visible
  // "ghost chips / duplicate pill" bleed-through reported on /live and
  // during incoming calls. Unmounting the whole host on non-tab routes
  // kills the portals at the source. When the user returns to a tab path,
  // each tab is rebuilt from its own preserved scroll/list state via the
  // existing per-page caches (React Query, Zustand) — visually identical
  // to before, just without the portal leak.
  if (!hostVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {(Object.keys(TABS) as TabKey[]).map((key) => {
        if (!mountedRef.current.has(key)) return null;
        const isActive = key === activeKey;
        const { Comp } = TABS[key];
        return (
          <div
            key={key}
            aria-hidden={!isActive}
            // Phase 9A: `inert` (where supported) blocks focus + interactions
            // for inactive tabs even if a stray portal child tries to capture
            // events. Combined with `display:none`, this fully isolates the
            // hidden tabs from the active one.
            {...(!isActive ? { inert: '' as unknown as boolean } : {})}
            style={{
              display: isActive ? 'block' : 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Suspense fallback={null}>
              <Comp />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}

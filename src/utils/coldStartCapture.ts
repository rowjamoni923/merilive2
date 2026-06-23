/**
 * Pkg434 Pass 3 — Early cold-start push & deep-link capture.
 *
 * When the app is launched from a killed state by tapping a push
 * notification or a deep link, the `pushNotificationActionPerformed`
 * / `appUrlOpen` events fire BEFORE React mounts and BEFORE
 * usePushNotifications / DeepLinkHandler attach their listeners.
 *
 * Without an early capture, these cold-start taps are silently lost
 * → user lands on the home page instead of the intended chat /
 * call / live screen.
 *
 * This module attaches the listeners as early as possible (from
 * main.tsx, before createRoot) and either:
 *   1. routes immediately via window.history.pushState (the SPA
 *      picks it up on first render — same path navigateInAppPath uses)
 *   2. stashes the target on window.__pendingDeepLink as a fallback
 *      for any later consumer that wants to inspect it.
 *
 * Zero risk: native-only, lazy plugin import, all errors swallowed,
 * no React imports.
 */
import { Capacitor } from '@capacitor/core';
import { getNotificationPath } from '@/utils/notificationDeepLink';

declare global {
  interface Window {
    __pendingDeepLink?: string;
    __coldStartHandled?: boolean;
  }
}

function routeTo(path: string) {
  if (!path) return;
  try {
    const target = path.startsWith('/') ? path : `/${path}`;
    window.__pendingDeepLink = target;
    // Use replaceState so the back button does not return to the
    // splash/initial URL the app launched on.
    window.history.replaceState(null, '', target);
    // Fire popstate so React Router (once mounted) syncs to the new path.
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch { /* ignore */ }
}

function pathFromPushData(data: Record<string, any> | undefined): string | null {
  if (!data) return null;
  // Delegate to the single source of truth (src/utils/notificationDeepLink.ts)
  // so cold-start taps and warm taps always land on the exact same route.
  // Previously this duplicated the routing table and used `/chat/<id>` for
  // message taps — which is NOT a real route → cold-start message tap 404'd.
  const path = getNotificationPath(data as Record<string, string>);
  return path || null;
}


export function installColdStartCapture(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (window.__coldStartHandled) return;
  window.__coldStartHandled = true;

  // 1) Deep-link cold start (custom scheme / universal link)
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appUrlOpen', ({ url }) => {
        if (!url) return;
        try {
          // Strip scheme/host, keep path+search+hash
          const u = new URL(url);
          routeTo(u.pathname + u.search + u.hash);
        } catch {
          // Custom scheme like "merilive://chat/123" — treat as raw path
          const stripped = url.replace(/^[a-z][a-z0-9+\-.]*:\/\/[^/]*/i, '');
          if (stripped) routeTo(stripped);
        }
      }).catch(() => {});

      // Inspect launch URL synchronously (cold-start case)
      App.getLaunchUrl?.().then((res) => {
        if (res?.url) {
          try {
            const u = new URL(res.url);
            routeTo(u.pathname + u.search + u.hash);
          } catch { /* ignore */ }
        }
      }).catch(() => {});
    })
    .catch(() => {});

  // 2) Push-notification cold start
  import('@capacitor/push-notifications')
    .then(({ PushNotifications }) => {
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const path = pathFromPushData(action?.notification?.data as any);
        if (path) routeTo(path);
      }).catch(() => {});
    })
    .catch(() => {});
}

export default installColdStartCapture;

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
  const type = String(data.type || '');
  const get = (k: string) => (data[k] ? String(data[k]) : '');

  if (type === 'incoming_call' || type === 'call') {
    return `/call?callId=${get('call_id') || get('callId')}`;
  }
  if (type === 'call_missed' || type === 'call_received') return '/call-history';
  if (type === 'message') return `/chat/${get('conversation_id') || get('conversationId')}`;
  if (type === 'follow' || type === 'new_follower') return `/profile-detail/${get('follower_id')}`;
  if (type === 'live' || type === 'live_started') {
    const sid = get('stream_id');
    return sid ? `/live/${sid}` : '/discover';
  }
  if (type === 'party_invite') {
    const rid = get('room_id');
    return rid ? `/party/${rid}` : '/party-rooms';
  }
  if (type === 'support_reply') {
    return `/settings/customer-service?mode=live_chat&ticket_id=${get('ticket_id')}`;
  }
  if (type.startsWith('agency_')) return '/agency-dashboard';

  // Explicit deep-link path
  const explicit = get('path') || get('route') || get('deep_link');
  if (explicit) return explicit;
  return null;
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

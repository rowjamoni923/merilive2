import React, { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Heartbeat interval — keep hosts online without waking every screen constantly.
const HEARTBEAT_INTERVAL = 120_000;

// Cleanup RPC guard
const CLEANUP_STORAGE_KEY = 'presence_cleanup_last_run_at';
const CLEANUP_COOLDOWN_MS = 30 * 60 * 1000;

// Manual offline key
const MANUAL_OFFLINE_KEY = 'meri_manual_offline';

const idle = (cb: () => void, timeout = 8000) => {
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') return w.requestIdleCallback(cb, { timeout });
  return window.setTimeout(cb, timeout);
};

const cancelIdle = (id: number) => {
  const w = window as any;
  if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
  else clearTimeout(id);
};

const isAdminRoute = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

/**
 * 🔵 Enhanced PresenceProvider v2
 * 
 * ALL USERS: Stay online even when app is closed/backgrounded.
 * Only go offline when:
 *   1. User explicitly presses "Go Offline" button
 *   2. User logs out
 *   3. cleanup_stale_online_users runs after 1+ hour of no heartbeat
 * 
 * Also handles FCM push notification token registration.
 */
export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const isSettingOffline = useRef(false);
  const lastOnlineSet = useRef<number>(0);
  const fcmInitialized = useRef(false);

  // ============ GO OFFLINE (explicit only) ============
  const setOfflineStatus = useCallback(async (uid: string, force = false) => {
    // Only go offline if forced (logout or explicit "Go Offline" button)
    if (!force) {
      if (import.meta.env.DEV) console.info('[Presence] 🟢 Skipping offline - user stays online');
      return;
    }

    if (isSettingOffline.current) return;
    isSettingOffline.current = true;

    try {
      if (import.meta.env.DEV) console.info('[Presence] 🔴 Setting OFFLINE for:', uid);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_host_online_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ p_user_id: uid, p_is_online: false }),
        keepalive: true,
      });
    } catch (e) {
      console.error('[Presence] Failed to set offline:', e);
    } finally {
      isSettingOffline.current = false;
    }
  }, []);

  // ============ ONLINE STATUS ============
  const setOnlineStatus = useCallback(async (uid: string, opts?: { force?: boolean }) => {
    // Only hosts can go manually offline; regular users are ALWAYS online
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true' && isHost) {
      if (import.meta.env.DEV) console.info('[Presence] 🔴 Host is manually offline, skipping heartbeat');
      return;
    }

    const now = Date.now();
    // Throttle normal heartbeats to 2s; force=true bypasses throttle for
    // instant transitions (call end / back-to-home / live end).
    if (!opts?.force && now - lastOnlineSet.current < 2000) return;
    lastOnlineSet.current = now;

    try {
      await supabase.rpc('sync_host_online_status', { p_user_id: uid, p_is_online: true });
      if (import.meta.env.DEV) console.info('[Presence] 🟢 Set ONLINE for:', uid, opts?.force ? '(forced)' : '');
    } catch (e) {
      console.error('[Presence] Failed to set online:', e);
    }
  }, []);

  // ============ CLEANUP STALE SESSIONS ============
  const runCleanupIfDue = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const now = Date.now();
    try {
      const lastRun = Number(localStorage.getItem(CLEANUP_STORAGE_KEY) || 0);
      if (now - lastRun < CLEANUP_COOLDOWN_MS) return;
      localStorage.setItem(CLEANUP_STORAGE_KEY, String(now));
    } catch { /* ignore */ }

    try {
      await supabase.rpc('cleanup_stale_online_users');
    } catch { /* ignore */ }
  }, []);

  // ============ INIT: GET USER + REGISTER FCM ============
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      if (isAdminRoute()) return;
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (user && !cancelled) {
        setUserId(user.id);
        
        // Check if user is a host
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_host')
          .eq('id', user.id)
          .single();
        if (!cancelled) setIsHost(profile?.is_host === true);

        // 🟢 Auto-online on every app entry — even if host previously tapped "Go Offline".
        // Rule (user-locked): re-opening the app must INSTANTLY flip them back online.
        // Clear the manual-offline flag and also flip host_availability back to 'online'
        // so the homepage feed shows them immediately.
        try { localStorage.removeItem(MANUAL_OFFLINE_KEY); } catch {}
        void (async () => {
          try { await supabase.rpc('sync_host_online_status', { p_user_id: user.id, p_is_online: true }); } catch {}
          if (profile?.is_host) {
            try { await supabase.from('profiles').update({ host_availability: 'online' }).eq('id', user.id); } catch {}
          }
        })();

        // Register FCM push notification token after first screens are smooth.
        if (!fcmInitialized.current) {
          fcmInitialized.current = true;
          idle(() => {
            import('@/services/firebaseMessaging').then(({ registerFCMToken, setupForegroundMessageHandler }) => {
              registerFCMToken(user.id).catch(e => console.warn('[FCM] Registration skipped:', e));
              
              setupForegroundMessageHandler((payload) => {
                const data = payload.data || {};
                const notifTitle = payload.notification?.title || data.title;
                const notifBody = payload.notification?.body || data.body;

                if (data.type === 'incoming_call') {
                  try {
                    const callId = (data as any).call_id || (data as any).callId;
                    if (callId && typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('incoming-call-notification', {
                        detail: {
                          type: 'incoming_call',
                          data: {
                            call_id: callId,
                            caller_id: (data as any).caller_id,
                            caller_name: (data as any).caller_name,
                          },
                        },
                      }));
                    }
                  } catch { /* noop */ }
                  toast.info(`📞 ${notifTitle}`, { description: notifBody, duration: 30000 });
                } else if (notifTitle) {
                  toast(notifTitle, { description: notifBody });
                }
              }).catch(e => console.warn('[FCM] Foreground handler skipped:', e));
            }).catch(() => {});
          }, 8000);
        }
      }
    };
    
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserId(session.user.id);
        localStorage.removeItem(MANUAL_OFFLINE_KEY); // Clear manual offline on login
        
        supabase
          .from('profiles')
          .select('is_host')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setIsHost(data?.is_host === true));

        // Register FCM token for new login without blocking auth UI.
        idle(() => {
          import('@/services/firebaseMessaging')
            .then(({ registerFCMToken }) => registerFCMToken(session.user.id).catch(() => {}))
            .catch(() => {});
        }, 8000);
      } else if (event === 'SIGNED_OUT') {
        // Force offline + deactivate FCM on logout
        if (userId) {
          setOfflineStatus(userId, true);
          import('@/services/firebaseMessaging')
            .then(({ deactivateFCMToken }) => deactivateFCMToken(userId).catch(() => {}))
            .catch(() => {});
        }
        localStorage.removeItem(MANUAL_OFFLINE_KEY);
        setUserId(null);
        setIsHost(false);
        fcmInitialized.current = false;
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [userId, setOfflineStatus]);

  // ============ MAIN PRESENCE TRACKING ============
  useEffect(() => {
    if (isAdminRoute()) return;
    if (!userId) return;
    // Only hosts can be manually offline; regular users always start heartbeat
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true' && isHost) {
      if (import.meta.env.DEV) console.info('[Presence] Host is manually offline, not starting heartbeat');
      return;
    }

    if (import.meta.env.DEV) console.info('[Presence] Starting presence tracking for:', userId);

    // Set online almost immediately — instant presence on app open / route enter.
    const onlineIdleId = idle(() => void setOnlineStatus(userId, { force: true }), 200);

    // Phase-3 C7: after coming back online, check for missed calls that are
    // still pending/ringing within the timeout window and re-fire the incoming
    // call notification so the modal pops up instantly.
    const missedCallIdleId = idle(() => {
      void (async () => {
        try {
          const { data: missedCalls } = await supabase
            .from('private_calls')
            .select('id, caller_id, created_at, status')
            .eq('host_id', userId)
            .in('status', ['pending', 'ringing'])
            .gt('created_at', new Date(Date.now() - 120_000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1);
          if (missedCalls && missedCalls.length > 0) {
            const call = missedCalls[0];
            window.dispatchEvent(new CustomEvent('incoming-call-notification', {
              detail: {
                type: 'incoming_call',
                data: { call_id: call.id, caller_id: call.caller_id },
              },
            }));
            if (import.meta.env.DEV) console.info('[Presence] 🔔 Re-ringing missed call:', call.id);
          }
        } catch {
          /* ignore — non-critical re-ring path */
        }
      })();
    }, 2500);

    // Stale cleanup is maintenance work; never run it during visible startup.
    const cleanupIdleId = idle(() => runCleanupIfDue(), 30000);
    const cleanupInterval = setInterval(() => runCleanupIfDue(), CLEANUP_COOLDOWN_MS);

    // Heartbeat
    heartbeatInterval.current = setInterval(() => {
      setOnlineStatus(userId);
    }, HEARTBEAT_INTERVAL);

    // ============ ZERO-REFRESH POLICY ============
    // Presence is maintained by the heartbeat timer only. Foreground/resume and
    // visibility changes must not trigger immediate DB writes or data refreshes.

    // ============ WEB BROWSER HANDLERS ============
    // App close / tab close: DO NOT set offline
    // User stays online until cleanup_stale_online_users handles it
    // or until they explicitly press "Go Offline"

    // ============ CLEANUP ============
    return () => {
      if (import.meta.env.DEV) console.info('[Presence] Cleanup for:', userId);
      
      cancelIdle(onlineIdleId);
      cancelIdle(missedCallIdleId);
      cancelIdle(cleanupIdleId);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      clearInterval(cleanupInterval);
      // DO NOT set offline on unmount — user stays online
    };
  }, [userId, isHost, setOnlineStatus, setOfflineStatus, runCleanupIfDue]);

  return <>{children}</>;
};

/**
 * Go offline manually — called from Profile "Go Offline" button
 */
export async function goOfflineManually(userId: string) {
  localStorage.setItem(MANUAL_OFFLINE_KEY, 'true');
  try {
    await supabase.rpc('sync_host_online_status', { p_user_id: userId, p_is_online: false });
    if (import.meta.env.DEV) console.info('[Presence] 🔴 Manual offline for:', userId);
  } catch (e) {
    console.error('[Presence] Manual offline failed:', e);
  }
}

/**
 * Force an instant online/heartbeat write, bypassing throttles.
 * Call after: private call end, live stream end, party leave, back-to-home,
 * back-to-live, or any transition that should immediately mark the host as
 * available again on the homepage feed.
 */
export async function forceOnlineNow(userId: string) {
  if (!userId) return;
  if (localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true') return;
  try {
    await supabase.rpc('sync_host_online_status', { p_user_id: userId, p_is_online: true });
    if (import.meta.env.DEV) console.info('[Presence] ⚡ Forced ONLINE for:', userId);
  } catch (e) {
    console.error('[Presence] forceOnlineNow failed:', e);
  }
}

/**
 * Go online manually — called when user reopens app after manual offline
 */
export async function goOnlineManually(userId: string) {
  localStorage.removeItem(MANUAL_OFFLINE_KEY);
  try {
    await supabase.rpc('sync_host_online_status', { p_user_id: userId, p_is_online: true });
    if (import.meta.env.DEV) console.info('[Presence] 🟢 Manual online for:', userId);
  } catch (e) {
    console.error('[Presence] Manual online failed:', e);
  }
}

/**
 * Check if user is manually offline
 */
export function isManuallyOffline(): boolean {
  return localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true';
}

export default PresenceProvider;

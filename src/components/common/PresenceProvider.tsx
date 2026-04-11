import React, { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { registerFCMToken, setupForegroundMessageHandler, deactivateFCMToken } from "@/services/firebaseMessaging";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Heartbeat interval - 30 seconds
const HEARTBEAT_INTERVAL = 30_000;

// Cleanup RPC guard
const CLEANUP_STORAGE_KEY = 'presence_cleanup_last_run_at';
const CLEANUP_COOLDOWN_MS = 2 * 60 * 1000;

// Manual offline key
const MANUAL_OFFLINE_KEY = 'meri_manual_offline';

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
      console.log('[Presence] 🟢 Skipping offline - user stays online');
      return;
    }

    if (isSettingOffline.current) return;
    isSettingOffline.current = true;

    try {
      console.log('[Presence] 🔴 Setting OFFLINE for:', uid);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_online_status`, {
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
  const setOnlineStatus = useCallback(async (uid: string) => {
    // Only hosts can go manually offline; regular users are ALWAYS online
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true' && isHost) {
      console.log('[Presence] 🔴 Host is manually offline, skipping heartbeat');
      return;
    }

    const now = Date.now();
    if (now - lastOnlineSet.current < 10000) return;
    lastOnlineSet.current = now;

    try {
      await supabase.rpc('update_online_status', { p_user_id: uid, p_is_online: true });
      console.log('[Presence] 🟢 Set ONLINE for:', uid);
    } catch (e) {
      console.error('[Presence] Failed to set online:', e);
    }
  }, []);

  // ============ CLEANUP STALE SESSIONS ============
  const runCleanupIfDue = useCallback(async () => {
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

        // Check if host was manually offline — regular users always go online
        if (localStorage.getItem(MANUAL_OFFLINE_KEY) !== 'true' || !profile?.is_host) {
          void (async () => { try { await supabase.rpc('update_online_status', { p_user_id: user.id, p_is_online: true }); } catch {} })();
        }

        // Register FCM push notification token
        if (!fcmInitialized.current) {
          fcmInitialized.current = true;
          registerFCMToken(user.id).catch(e => console.warn('[FCM] Registration skipped:', e));
          
          setupForegroundMessageHandler((payload) => {
            const data = payload.data || {};
            const notifTitle = payload.notification?.title || data.title;
            const notifBody = payload.notification?.body || data.body;
            
            if (data.type === 'incoming_call') {
              // Incoming call — show prominent toast
              toast.info(`📞 ${notifTitle}`, { description: notifBody, duration: 30000 });
            } else if (notifTitle) {
              toast(notifTitle, { description: notifBody });
            }
          }).catch(e => console.warn('[FCM] Foreground handler skipped:', e));
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

        // Register FCM token for new login
        registerFCMToken(session.user.id).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        // Force offline + deactivate FCM on logout
        if (userId) {
          setOfflineStatus(userId, true);
          deactivateFCMToken(userId).catch(() => {});
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
    if (!userId) return;
    // Only hosts can be manually offline; regular users always start heartbeat
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true' && isHost) {
      console.log('[Presence] Host is manually offline, not starting heartbeat');
      return;
    }

    console.log('[Presence] Starting presence tracking for:', userId);

    // Set online immediately
    setOnlineStatus(userId);
    
    // Run cleanup
    runCleanupIfDue();
    const cleanupInterval = setInterval(() => runCleanupIfDue(), CLEANUP_COOLDOWN_MS);

    // Heartbeat
    heartbeatInterval.current = setInterval(() => {
      setOnlineStatus(userId);
    }, HEARTBEAT_INTERVAL);

    // ============ NATIVE APP HANDLERS ============
    let appStateCleanup: (() => void) | undefined;
    
    if (Capacitor.isNativePlatform()) {
      const setupNativeListeners = async () => {
        try {
          const { App } = await import('@capacitor/app');
          
          const stateListener = await App.addListener('appStateChange', async ({ isActive }) => {
            console.log('[Presence] Native state:', isActive ? 'ACTIVE' : 'BACKGROUND');
            if (isActive) {
              isSettingOffline.current = false;
              if (localStorage.getItem(MANUAL_OFFLINE_KEY) !== 'true') {
                await setOnlineStatus(userId);
              }
            }
            // Background: DO NOTHING — user stays online
            // cleanup_stale_online_users will handle truly stale sessions
          });

          const resumeListener = await App.addListener('resume', async () => {
            console.log('[Presence] App RESUMED');
            isSettingOffline.current = false;
            if (localStorage.getItem(MANUAL_OFFLINE_KEY) !== 'true') {
              await setOnlineStatus(userId);
            }
          });

          appStateCleanup = () => {
            stateListener.remove();
            resumeListener.remove();
          };
        } catch (error) {
          console.error('[Presence] Native listener error:', error);
        }
      };
      
      setupNativeListeners();
    }

    // ============ WEB BROWSER HANDLERS ============
    // App close / tab close: DO NOT set offline
    // User stays online until cleanup_stale_online_users handles it
    // or until they explicitly press "Go Offline"

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && localStorage.getItem(MANUAL_OFFLINE_KEY) !== 'true') {
        setOnlineStatus(userId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ============ CLEANUP ============
    return () => {
      console.log('[Presence] Cleanup for:', userId);
      
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      clearInterval(cleanupInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      appStateCleanup?.();
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
    await supabase.rpc('update_online_status', { p_user_id: userId, p_is_online: false });
    console.log('[Presence] 🔴 Manual offline for:', userId);
  } catch (e) {
    console.error('[Presence] Manual offline failed:', e);
  }
}

/**
 * Go online manually — called when user reopens app after manual offline
 */
export async function goOnlineManually(userId: string) {
  localStorage.removeItem(MANUAL_OFFLINE_KEY);
  try {
    await supabase.rpc('update_online_status', { p_user_id: userId, p_is_online: true });
    console.log('[Presence] 🟢 Manual online for:', userId);
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

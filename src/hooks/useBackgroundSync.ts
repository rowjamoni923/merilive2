import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { BackgroundSync } from '@/plugins/BackgroundSync';
import { useGlobalUnreadCount } from '@/hooks/useGlobalUnreadCount';

/**
 * Pkg221 — wires the native BackgroundSync periodic worker to the
 * current Supabase auth session. Enables on SIGNED_IN, refreshes the
 * JWT on TOKEN_REFRESHED, disables on SIGNED_OUT.
 *
 * No-op outside Android-native (web/iOS).
 */
export const useBackgroundSync = () => {
  // Pkg252 — mirror in-app total to the QuickActions widget badge in real time.
  const counts = useGlobalUnreadCount();

  useEffect(() => {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) {
      return;
    }
    BackgroundSync.setUnreadCount({ count: counts.total | 0 }).catch(() => {});
  }, [counts.total]);

  useEffect(() => {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) {
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!supabaseUrl || !anonKey) return;

    const enableFromSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !session.user?.id) {
          await BackgroundSync.disable();
          return;
        }
        await BackgroundSync.enable({
          supabaseUrl,
          anonKey,
          accessToken: session.access_token,
          userId: session.user.id,
          intervalMinutes: 15,
        });
      } catch {
        /* ignore */
      }
    };

    void enableFromSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'SIGNED_OUT' || !session) {
          await BackgroundSync.disable();
          return;
        }
        if (event === 'TOKEN_REFRESHED' && session.access_token) {
          await BackgroundSync.refreshToken({ accessToken: session.access_token });
          return;
        }
        if (event === 'SIGNED_IN' && session.access_token && session.user?.id) {
          await BackgroundSync.enable({
            supabaseUrl,
            anonKey,
          });
        }
      } catch {
        /* ignore */
      }
    });

    return () => subscription.unsubscribe();
  }, []);
};

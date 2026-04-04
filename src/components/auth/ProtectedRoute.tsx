import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import BannedScreen from './BannedScreen';
import VpnWarningBanner from '@/components/VpnWarningBanner';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';

interface ProtectedRouteProps {
  children: ReactNode;
  session: Session | null;
}

// Cache ban check result to avoid repeated DB calls on every route change
const banCheckCache = new Map<string, { isBanned: boolean; checkedAt: number }>();
const BAN_CACHE_TTL = 60_000; // Re-check every 60s

const ProtectedRoute = ({ children, session }: ProtectedRouteProps) => {
  const location = useLocation();
  const [isBanned, setIsBanned] = useState(false);
  const [checked, setChecked] = useState(false);
  const checkingRef = useRef(false);

  // Session hijacking protection
  useSessionSecurity();

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setChecked(true);
      return;
    }

    // Check cache first — instant render if cached
    const cached = banCheckCache.get(userId);
    if (cached && Date.now() - cached.checkedAt < BAN_CACHE_TTL) {
      setIsBanned(cached.isBanned);
      setChecked(true);
    }

    // Prevent duplicate concurrent checks
    if (!checkingRef.current) {
      checkingRef.current = true;
      setChecked(true);

      (async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('is_blocked, device_id')
            .eq('id', userId)
            .single();

          let banned = false;

          if (data?.is_blocked) {
            banned = true;
          } else if (data?.device_id) {
            const { data: bannedDevice } = await supabase
              .from('banned_devices')
              .select('id')
              .eq('device_id', data.device_id)
              .eq('is_permanent', true)
              .maybeSingle();

            if (bannedDevice) {
              await supabase
                .from('profiles')
                .update({ is_blocked: true, blocked_reason: 'Device permanently banned' })
                .eq('id', userId);
              banned = true;
            }
          }

          banCheckCache.set(userId, { isBanned: banned, checkedAt: Date.now() });
          if (banned) setIsBanned(true);
        } catch (e) {
          // Don't block on error
        } finally {
          checkingRef.current = false;
        }
      })();
    }

    // INSTANT ban detection via direct Supabase channel (bypasses universal realtime debounce)
    const banChannel = supabase
      .channel(`direct-ban-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (payload.new?.is_blocked === true) {
            console.log('[ProtectedRoute] 🚨 INSTANT ban detected via realtime!');
            banCheckCache.set(userId, { isBanned: true, checkedAt: Date.now() });
            setIsBanned(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(banChannel);
    };
  }, [session?.user?.id]);

  if (!session) {
    const returnTo = location.pathname + location.search;
    const shouldStoreReturn = 
      returnTo !== '/' && 
      !returnTo.startsWith('/auth') && 
      !returnTo.startsWith('/reset-password') &&
      !returnTo.startsWith('/smart-link') &&
      !returnTo.startsWith('/link');
    
    if (shouldStoreReturn) {
      localStorage.setItem('meri_return_to', returnTo);
    }

    return <Navigate to="/auth" replace />;
  }

  if (!checked) {
    return <div className="min-h-screen bg-background" aria-hidden />;
  }

  if (isBanned) {
    return <BannedScreen />;
  }

  return (
    <>
      <VpnWarningBanner />
      {children}
    </>
  );
};

export default ProtectedRoute;

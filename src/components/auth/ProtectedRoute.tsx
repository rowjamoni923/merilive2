import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import BanPopupDialog from './BanPopupDialog';
import VpnWarningBanner from '@/components/VpnWarningBanner';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';
import { triggerLegacyProfileSync } from '@/utils/legacyProfileSync';

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
  const [banReason, setBanReason] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [waitedForRecovery, setWaitedForRecovery] = useState(!!session);
  const checkingRef = useRef(false);

  // Session hijacking protection
  useSessionSecurity();

  // If no session, wait briefly for background recovery before redirecting
  useEffect(() => {
    if (session) {
      setWaitedForRecovery(true);
      return;
    }

    // Give background session recovery up to 1.5s to complete
    const timer = setTimeout(() => {
      setWaitedForRecovery(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [session]);

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
          const { data, error } = await supabase
            .from('profiles')
            .select('is_blocked, blocked_reason, device_id')
            .eq('id', userId)
            .maybeSingle();

          // Missing profile rows must recover in-place.
          // Never force sign-out here because Profile page already has self-healing logic.
          if (!error && data === null) {
            console.warn('[ProtectedRoute] Profile missing, attempting recovery without sign-out');
            try {
              await triggerLegacyProfileSync(userId, { force: true });
            } catch (syncError) {
              console.warn('[ProtectedRoute] Profile recovery attempt failed', syncError);
            }
            return;
          }

          // On error, leave user in place — don't redirect
          if (error || !data) {
            console.warn('[ProtectedRoute] Profile fetch error, skipping ban check', error);
            return;
          }

          let banned = false;

          if (data?.is_blocked) {
            banned = true;
          }
          // NOTE: Device-ban auto-propagation removed.
          // Reason: it caused FALSE-POSITIVE bans for new signups.
          // Device bans are now enforced ONLY by admin manually setting
          // profiles.is_blocked = true via the Admin Panel.
          // The banned_devices table is used for analytics / admin lookup,
          // not for automatic profile blocking on the client.

          banCheckCache.set(userId, { isBanned: banned, checkedAt: Date.now() });
          if (banned) {
            setIsBanned(true);
            setBanReason(data?.blocked_reason ?? null);
          }
        } catch (e) {
          // Don't block on error
          console.warn('[ProtectedRoute] Ban check exception', e);
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
            setBanReason(payload.new?.blocked_reason ?? null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(banChannel);
    };
  }, [session?.user?.id]);

  if (profileMissing) {
    return <Navigate to="/auth" replace />;
  }

  // Wait briefly for background session recovery before redirecting to auth
  if (!session && !waitedForRecovery) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          </div>
          <h1 className="text-base font-semibold text-foreground">Restoring session</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please wait a moment...</p>
        </div>
      </div>
    );
  }

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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          </div>
          <h1 className="text-base font-semibold text-foreground">Loading your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">We're preparing your access...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <VpnWarningBanner />
      {children}
      <BanPopupDialog open={isBanned} reason={banReason} bannedUntil={null} />
    </>
  );
};

export default ProtectedRoute;

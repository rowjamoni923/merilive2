import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import BanPopupDialog from './BanPopupDialog';
import VpnWarningBanner from '@/components/VpnWarningBanner';
import MeriLiveLoader from '@/components/MeriLiveLoader';
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
  const [localSession, setLocalSession] = useState<Session | null>(session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [waitedForRecovery, setWaitedForRecovery] = useState(!!session);
  const checkingRef = useRef(false);
  const effectiveSession = session ?? localSession;

  // Session hijacking protection
  useSessionSecurity();

  // If no session, wait briefly for background recovery before redirecting
  useEffect(() => {
    if (session) {
      setLocalSession(session);
      setWaitedForRecovery(true);
      return;
    }

    // Give background session recovery up to 1.5s to complete
    setWaitedForRecovery(false);
    let cancelled = false;

    const timer = setTimeout(() => {
      void supabase.auth.getSession()
        .then(({ data }) => {
          if (cancelled) return;
          setLocalSession(data.session ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setLocalSession(null);
        })
        .finally(() => {
          if (!cancelled) {
            setWaitedForRecovery(true);
          }
        });
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session]);

  useEffect(() => {
    const userId = effectiveSession?.user?.id;
    if (!userId) {
      setChecked(true);
      return;
    }

    // Always allow render immediately — ban check runs in background.
    // This prevents the "Loading your account" screen from getting stuck
    // if a previous async check is still in flight on route change.
    setChecked(true);

    // Check cache first — apply cached ban state if any
    const cached = banCheckCache.get(userId);
    if (cached && Date.now() - cached.checkedAt < BAN_CACHE_TTL) {
      setIsBanned(cached.isBanned);
    }

    // Prevent duplicate concurrent checks
    if (!checkingRef.current) {
      checkingRef.current = true;

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

    // Instant ban detection via Pkg37 admin_broadcast. `profiles` is NOT in
    // supabase_realtime publication, so direct postgres_changes here was dead.
    const onAdminProfileUpdate = async (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table !== 'profiles') return;
      const { data } = await supabase
        .from('profiles') // guard-ok: owner-only ban status recheck after admin_broadcast profile topic
        .select('is_blocked, blocked_reason')
        .eq('id', userId)
        .maybeSingle();
      if (data?.is_blocked === true) {
        banCheckCache.set(userId, { isBanned: true, checkedAt: Date.now() });
        setIsBanned(true);
        setBanReason(data.blocked_reason ?? null);
      }
    };
    window.addEventListener('admin-table-update', onAdminProfileUpdate as EventListener);

    return () => {
      window.removeEventListener('admin-table-update', onAdminProfileUpdate as EventListener);
    };
  }, [effectiveSession?.user?.id]);

  if (profileMissing) {
    return <Navigate to="/auth" replace />;
  }

  // Wait briefly for background session recovery before redirecting to auth
  if (!effectiveSession && !waitedForRecovery) {
    return <MeriLiveLoader />;
  }

  if (!effectiveSession) {
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
      <MeriLiveLoader
        message="Loading your account"
        subMessage="We're preparing your access..."
      />
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

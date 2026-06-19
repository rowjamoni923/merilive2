import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import BanPopupDialog from './BanPopupDialog';
import VpnWarningBanner from '@/components/VpnWarningBanner';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';
import { triggerLegacyProfileSync } from '@/utils/legacyProfileSync';
import { isNativeApp } from '@/utils/nativeUtils';

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
    // This prevents account checks from blocking the route surface if a
    // previous async check is still in flight on route change.
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

  // Native app cold starts must not show a branded loading blocker while
  // Capacitor Preferences hydrates Supabase auth. Render the cached route
  // surface during the short recovery window, then redirect only if recovery
  // actually fails.
  if (!effectiveSession && !waitedForRecovery) {
    if (isNativeApp() && localStorage.getItem('meri_manual_logout') !== 'true') {
      return <>{children}</>;
    }
    // Pkg504: dark skeleton for room/call routes so cream `bg-background` never
    // flashes through during the brief auth-recovery window on web/refresh.
    const p = (typeof window !== 'undefined' ? window.location.pathname : '/').toLowerCase();
    const isDarkRoute =
      /^\/live\/[^/]+/.test(p) ||
      p.startsWith('/live-feed') ||
      p.startsWith('/party/') ||
      p === '/go-live' ||
      p.startsWith('/call/') ||
      p.startsWith('/active-call') ||
      p.startsWith('/incoming-call') ||
      p.startsWith('/outgoing-call') ||
      p.startsWith('/stream/');

    if (isDarkRoute) {
      return (
        <div className="fixed inset-0" style={{ backgroundColor: '#050208' }} aria-hidden="true">
          <div className="absolute inset-0 bg-white/[0.03] animate-pulse" />
        </div>
      );
    }
    return (
      <div className="min-h-screen w-full bg-background pt-safe" aria-hidden="true">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="h-8 w-32 rounded-lg bg-foreground/10 animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-foreground/10 animate-pulse" />
            <div className="h-9 w-9 rounded-full bg-foreground/10 animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-16 rounded-full bg-foreground/[0.07] animate-pulse" />
          ))}
        </div>
        <div className="px-4 pb-24 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-44 rounded-2xl bg-foreground/[0.08] animate-pulse" />
            <div className="h-44 rounded-2xl bg-foreground/[0.08] animate-pulse" />
          </div>
          <div className="space-y-2.5 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-foreground/[0.05]">
                <div className="h-12 w-12 rounded-full bg-foreground/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 rounded bg-foreground/10 animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-foreground/[0.07] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="fixed inset-x-0 bottom-0 border-t border-foreground/5 bg-background/95 backdrop-blur-sm pb-safe">
          <div className="flex items-center justify-around px-4 py-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-6 w-6 rounded-md bg-foreground/10 animate-pulse" />
                <div className="h-2 w-8 rounded bg-foreground/[0.07] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
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

  if (!checked) return <>{children}</>;

  return (
    <>
      <VpnWarningBanner />
      {children}
      <BanPopupDialog open={isBanned} reason={banReason} bannedUntil={null} />
    </>
  );
};

export default ProtectedRoute;

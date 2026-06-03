import { useState, useEffect, ReactNode, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

const BlogPage = lazy(() => import("@/pages/BlogPage"));
import { getAdminSession, getAdminSessionToken, clearAdminSession } from "@/utils/adminSession";
import {
  grantAdminAccess,
  revokeAdminAccess,
  setAdminLinkToken,
  setAdminLinkKind,
  setAdminLinkChallenge,
  hasAdminAccessFlag,
  getAdminLinkToken,
} from "@/utils/adminAccessStorage";
import { adminSupabase } from "@/integrations/supabase/adminClient";

const VALIDATE_TIMEOUT_MS = 6_000;
const VALIDATE_ATTEMPTS = 2;
const VALIDATE_RETRY_DELAY_MS = 800;

/**
 * AdminAccessGuard
 *
 * Now uses the dedicated admin session (independent from user app auth).
 *
 * Logic:
 * 1. Fresh URL has `?access=<token>` → validate token via edge function, set tab-scoped flag, allow login page
 * 2. Has admin session AND this tab came from a secret link → allow admin panel
 * 3. Direct /admin or /admin/auth without a valid secret-link tab unlock → show public page
 * 4. Never show the "Verifying access" loader unless a fresh `?access=` token is actually in the URL
 */

interface AdminAccessGuardProps {
  children: ReactNode;
}

const getAccessTokenFromURL = (): string | null => {
  try {
    const t = new URLSearchParams(window.location.search).get('access');
    return t ? decodeURIComponent(t).trim() : null;
  } catch {
    return null;
  }
};

const isLoginRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return p === '/admin/auth' || p === '/admin/login';
};

const sessionMatchesLinkRole = (session: ReturnType<typeof getAdminSession>, role: 'owner' | 'sub_admin'): boolean => {
  if (!session) return true;
  return role === 'owner' ? session.is_owner === true : session.is_owner === false;
};

const hasPotentialAdminSession = (): boolean => {
  const session = getAdminSession();
  return !!session && getAdminSessionToken().length >= 16;
};

export default function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const location = useLocation();
  const accessTokenFromRoute = new URLSearchParams(location.search).get('access')?.trim() || null;

  // STRICT RULE (per user): a secret link must ALWAYS render the admin panel.
  // It must NEVER fall back to the public BlogPage — not on slow networks,
  // not on edge-function 5xx, not on validation race conditions. Validation
  // failures are surfaced inside the admin auth screen, never as a blog.
  const hasFreshAccessToken = !!accessTokenFromRoute;

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const isAuthRoute = window.location.pathname === '/admin/auth' || window.location.pathname === '/admin/login';

    // Fresh secret link in URL → render admin shell immediately (optimistic).
    // Background validation happens below; on failure we redirect within admin,
    // never to BlogPage.
    if (getAccessTokenFromURL()) {
      return true;
    }

    if (isAuthRoute && !accessTokenFromRoute) {
      return true;
    }

    // Existing admin sessions were created through a secret link already.
    // Render the admin shell INSTANTLY — background validation can revoke
    // later if the session is actually invalid. No spinner, no delay.
    if (hasPotentialAdminSession()) return true;
    return hasAdminAccessFlag() && !!getAdminLinkToken();
  });

  useEffect(() => {
    let mounted = true;
    let validationSettled = false;
    let safetyTimer: number | undefined;

    const denyAccess = () => {
      if (!mounted || validationSettled) return;
      validationSettled = true;
      // NO-AUTO-LOGOUT: validation failures must never delete an existing
      // admin session. They only affect whether this route is rendered.
      if (!getAdminSession()) revokeAdminAccess();
      // If a secret link was in the URL, KEEP the user on the admin auth
      // screen instead of dumping them onto the public BlogPage. The auth
      // screen will simply show "invalid token" when they try to log in.
      if (hasFreshAccessToken) {
        setIsAuthorized(true);
        return;
      }
      setIsAuthorized(false);
    };

    const decideSync = () => {
      if (!mounted) return;
      const session = getAdminSession();
      const accessToken = getAccessTokenFromURL();
      const tabAlreadyUnlocked = hasAdminAccessFlag();
      const storedLinkToken = getAdminLinkToken();
      const potentialAdminSession = !!session && getAdminSessionToken().length >= 16;

      // Fresh secret link in URL → optimistically grant + persist token,
      // validate in background. We do NOT switch to BlogPage on failure.
      if (accessToken) {
        setAdminLinkToken(accessToken);
        setIsAuthorized(true);
        return;
      }

      if (tabAlreadyUnlocked && storedLinkToken) {
        setIsAuthorized(true);
        return;
      }

      if (potentialAdminSession) {
        // Render admin shell immediately — validate silently in background.
        setIsAuthorized(true);
        (async () => {
          try {
            const timeout = new Promise<{ data: any }>((_, reject) =>
              setTimeout(() => reject(new Error('admin session validation timeout')), VALIDATE_TIMEOUT_MS)
            );
            const call = (async () => adminSupabase.rpc('current_admin_id_from_header' as any))();
            const { data } = await Promise.race([call, timeout]);
            if (!mounted) return;
            if (data && String(data) === session.admin_id) {
              grantAdminAccess(session.is_owner);
            }
            // On failure: keep session intact (NO-AUTO-LOGOUT). User stays in.
          } catch (e) {
            console.warn('[AdminAccessGuard] background session validation failed (kept session)', e);
          }
        })();
        return;
      }

      if (isLoginRoute()) {
        setIsAuthorized(true);
        return;
      }

      // Pkg360 NO-AUTO-LOGOUT: do NOT clear an existing admin session just
      // because the tab-scoped unlock flag is gone. We only gate rendering
      // (BlogPage fallback) — the persisted admin session token stays intact
      // so re-entering via secret link / login route restores access instantly.
      setIsAuthorized(false);
    };


    decideSync();

    // Background: validate URL access token. Even if it fails, we stay
    // inside the admin shell (denyAccess re-routes to /admin/auth when a
    // fresh access token was in the URL — never to BlogPage).
    const accessToken = getAccessTokenFromURL();
    if (accessToken) {
      safetyTimer = window.setTimeout(() => {
        console.warn('[AdminAccessGuard] validation safety timeout');
        denyAccess();
      }, (VALIDATE_TIMEOUT_MS * VALIDATE_ATTEMPTS) + (VALIDATE_RETRY_DELAY_MS * (VALIDATE_ATTEMPTS - 1)) + 1_000);

      const validateOnce = async (attempt: number): Promise<boolean> => {
        try {
          const timeout = new Promise<{ data: any }>((_, reject) =>
            setTimeout(() => reject(new Error('validate-admin-token timeout')), VALIDATE_TIMEOUT_MS)
          );
          const call = adminSupabase.functions.invoke('validate-admin-token', {
            body: { token: accessToken },
          }) as Promise<{ data: any }>;
          const { data } = await Promise.race([call, timeout]);
          if (!mounted || validationSettled) return true;
          if (data?.valid) {
            validationSettled = true;
            if (safetyTimer) window.clearTimeout(safetyTimer);
            const role = data.role === 'owner' ? 'owner' : 'sub_admin';
            const existingSession = getAdminSession();
            if (!sessionMatchesLinkRole(existingSession, role)) {
              console.warn('[AdminAccessGuard] secret-link role differs from current session; keeping session until manual logout');
            }
            setAdminLinkToken(accessToken);
            setAdminLinkKind(role);
            setAdminLinkChallenge(typeof data.challenge === 'string' ? data.challenge : null);
            grantAdminAccess(role === 'owner');
            if (mounted) {
              setIsAuthorized(true);
            }
            return true;
          }
          if (data && data.valid === false && mounted && !getAdminSession()) {
            denyAccess();
            return true;
          }
          return false;
        } catch (e) {
          console.warn(`[AdminAccessGuard] validation attempt ${attempt} failed`, e);
          return false;
        }
      };

      (async () => {
        for (let i = 1; i <= VALIDATE_ATTEMPTS; i++) {
          if (!mounted || validationSettled) return;
          const resolved = await validateOnce(i);
          if (resolved) return;
          if (i < VALIDATE_ATTEMPTS) await new Promise((r) => setTimeout(r, VALIDATE_RETRY_DELAY_MS));
        }
        denyAccess();
      })();
    }

    const handler = () => {
      const session = getAdminSession();
      if (session && getAdminSessionToken().length >= 16 && hasAdminAccessFlag()) setIsAuthorized(true);
      else if (!hasAdminAccessFlag() && !hasFreshAccessToken) {
        revokeAdminAccess();
        setIsAuthorized(false);
      }
    };
    window.addEventListener('storage', handler);
    window.addEventListener('admin-session-change', handler);

    return () => {
      mounted = false;
      if (safetyTimer) window.clearTimeout(safetyTimer);
      window.removeEventListener('storage', handler);
      window.removeEventListener('admin-session-change', handler);
    };
  }, [location.pathname, location.search, hasFreshAccessToken]);

  // Loading state — only reachable when there's NO fresh access token
  // (fresh tokens always optimistically render the admin shell).
  if (isAuthorized === null) {
    // Fresh secret links and already-issued server admin sessions both verify
    // inside the admin experience. Do not show the public BlogPage as an
    // intermediate state during admin navigation.
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Authorized: render admin panel / login page
  if (isAuthorized) {
    const session = getAdminSession();
    const accessToken = getAccessTokenFromURL() || getAdminLinkToken();
    // Fresh secret links must pass through /admin/auth first. Otherwise a
    // restored/stale local admin session can open /admin?access=... directly,
    // send a dead x-admin-token, and make every page show P0001 RPC failures.
    if (hasFreshAccessToken && !isLoginRoute()) {
      return <Navigate to={`/admin/auth?access=${encodeURIComponent(accessToken || accessTokenFromRoute || '')}`} replace />;
    }
    // Secret link + existing session → go straight to /admin (no re-login screen).
    if (isLoginRoute() && session) {
      return <Navigate to="/admin" replace />;
    }
    if (!session && !isLoginRoute()) {
      return <Navigate to={accessToken ? `/admin/auth?access=${encodeURIComponent(accessToken)}` : "/admin/auth"} replace />;
    }
    return <>{children}</>;
  }

  // Not authorized AND no fresh secret link → public BlogPage fallback.
  return <Suspense fallback={null}><BlogPage /></Suspense>;
}


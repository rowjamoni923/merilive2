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

export default function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;

    // Only a fresh secret link in the URL should put the guard into the
    // async "verifying" state. Direct /admin opens must resolve immediately.
    if (getAccessTokenFromURL()) {
      return null;
    }

    return hasAdminAccessFlag() && !!getAdminLinkToken();
  });
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    let validationSettled = false;
    let safetyTimer: number | undefined;

    const denyAccess = () => {
      if (!mounted || validationSettled) return;
      validationSettled = true;
      clearAdminSession();
      revokeAdminAccess();
      setIsAuthorized(false);
    };

    // Synchronous decision FIRST so we never spin forever if the edge fn is slow.
    //
    // STRICT RULE (per user): admin panel is reachable ONLY via a secret link.
    // - Fresh URL ?access=<token>           → validate, then unlock this tab
    // - This tab already unlocked via link  → allow (sessionStorage flag, tab-scoped)
    // - Anything else (bookmark, stale local session, direct /admin) → BlogPage
    //
    // A persistent admin session WITHOUT a tab-scoped link unlock is NOT enough.
    // This blocks: bookmarked /admin, shared session across new tab, attacker
    // who steals localStorage session token but never had the secret link.
    const decideSync = () => {
      if (!mounted) return;
      const session = getAdminSession();
      const accessToken = getAccessTokenFromURL();
      const tabAlreadyUnlocked = hasAdminAccessFlag();
      const storedLinkToken = getAdminLinkToken();

      // Fresh secret link in URL → always re-validate before rendering anything.
      if (accessToken) {
        setAdminLinkToken(accessToken);
        setIsAuthorized(null);
        return;
      }

      // Tab was unlocked earlier in this session via a secret link.
      // Re-validate the stored token in the background; render is gated below.
      if (tabAlreadyUnlocked && storedLinkToken) {
        if (!isLoginRoute()) {
          const token = getAdminSessionToken();
          if (!token) {
            // Tab is unlocked but no admin login yet → send to login page.
            setIsAuthorized(true);
            return;
          }
        }
        setIsAuthorized(true);
        return;
      }

      // No secret link, no tab unlock → deny. Even if a stale local admin
      // session exists, it cannot grant access without a secret-link unlock.
      if (session || storedLinkToken || tabAlreadyUnlocked) {
        clearAdminSession();
        revokeAdminAccess();
      }
      setIsAuthorized(false);
    };


    decideSync();

    // Background: validate URL access token (15s timeout) before rendering login.
    // After retries, deny access so invalid/rotated links cannot keep a stale
    // tab-scoped unlock flag alive.
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
              clearAdminSession();
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
          // Real {valid:false} response → invalid token. Only then deny.
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
        // Two short attempts before giving up; if all fail and no
        // admin session exists, fall back to BlogPage.
        for (let i = 1; i <= VALIDATE_ATTEMPTS; i++) {
          if (!mounted || validationSettled) return;
          const resolved = await validateOnce(i);
          if (resolved) return;
          if (i < VALIDATE_ATTEMPTS) await new Promise((r) => setTimeout(r, VALIDATE_RETRY_DELAY_MS));
        }
        denyAccess();
      })();
    }

    // Listen for session changes (login/logout in other tabs)
    const handler = () => {
      const session = getAdminSession();
      if (session) setIsAuthorized(true);
      else if (!hasAdminAccessFlag()) {
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
  }, [location.pathname, location.search]);

  // Loading
  if (isAuthorized === null) {
    if (getAccessTokenFromURL()) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Verifying access...</p>
          </div>
        </div>
      );
    }
    return <Suspense fallback={null}><BlogPage /></Suspense>;
  }

  // Authorized: render admin panel / login page
    if (isAuthorized) {
    const session = getAdminSession();
      const accessToken = getAccessTokenFromURL() || getAdminLinkToken();
    // If the user has a session and opens the plain login route, redirect to
    // admin home. But a fresh ?access= secret link must always render AdminAuth
    // so stale/expired local sessions cannot bypass re-authentication and then
    // get kicked to the public app by protected admin requests.
      if (isLoginRoute() && session && !getAccessTokenFromURL()) {
      return <Navigate to="/admin" replace />;
    }
    // If NO session and NOT on login route → redirect to login (preserve token in URL is unnecessary, flag is stored)
    if (!session && !isLoginRoute()) {
        return <Navigate to={accessToken ? `/admin/auth?access=${encodeURIComponent(accessToken)}` : "/admin/auth"} replace />;
    }
    return <>{children}</>;
  }

  // Not authorized
  return <Suspense fallback={null}><BlogPage /></Suspense>;
}

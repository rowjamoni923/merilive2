import { useState, useEffect, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import BlogPage from "@/pages/BlogPage";
import { Navigate, useLocation } from "react-router-dom";
import { getAdminSession, getAdminSessionToken, clearAdminSession } from "@/utils/adminSession";
import {
  grantAdminAccess,
  revokeAdminAccess,
  setAdminLinkToken,
  hasAdminAccessFlag,
  getAdminLinkToken,
} from "@/utils/adminAccessStorage";
import { adminSupabase } from "@/integrations/supabase/adminClient";

/**
 * AdminAccessGuard
 *
 * Now uses the dedicated admin session (independent from user app auth).
 *
 * Logic:
 * 1. URL has `?access=<token>` → validate token via edge function, set tab-scoped flag, allow login page
 * 2. Has admin session AND this tab came from a secret link → allow admin panel
 * 3. Direct /admin/auth or /admin/login without a secret link → show BlogPage
 * 4. Otherwise → show BlogPage (no admin panel hint)
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

export default function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [hasValidToken, setHasValidToken] = useState<boolean>(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    // Synchronous decision FIRST so we never spin forever if the edge fn is slow.
    // PRIORITY ORDER (instant grant — no flash of BlogPage):
    //   1. Active admin session                → authorized
    //   2. Tab already validated (sessionStorage flag) → authorized
    //   3. URL ?access=<token>                 → wait for validation (loader, never BlogPage)
    //   4. Nothing                             → BlogPage
    const decideSync = () => {
      if (!mounted) return;
      const session = getAdminSession();
      const accessToken = getAccessTokenFromURL();
      const tabAlreadyUnlocked = hasAdminAccessFlag();

      if (session) {
        // Session present — make sure header token is usable.
        if (!isLoginRoute()) {
          const token = getAdminSessionToken();
          if (!token) {
            clearAdminSession();
            revokeAdminAccess();
            setIsAuthorized(false);
            return;
          }
        }
        setIsAuthorized(true);
        return;
      }

      // No session. A previously unlocked tab or a fresh link must still be
      // validated before rendering AdminAuth, so rotated/invalid secret links
      // stop working immediately instead of relying on a stale session flag.
      if (tabAlreadyUnlocked && getAdminLinkToken()) {
        setIsAuthorized(null);
        return;
      }

      // Fresh secret-link entry — persist only the candidate token and wait for
      // server validation before granting access to the admin login page.
      if (accessToken) {
        setAdminLinkToken(accessToken);
        setIsAuthorized(null);
        return;
      }

      setIsAuthorized(false);
    };

    decideSync();

    // Background: validate URL access token (15s timeout) and persist flag.
    // CRITICAL: timeout / network error must NOT flip the user to BlogPage —
    // we keep them on the loader and let the retry below resolve.
    const accessToken = getAccessTokenFromURL() || getAdminLinkToken();
    if (accessToken) {
      const validateOnce = async (attempt: number): Promise<boolean> => {
        try {
          const timeout = new Promise<{ data: any }>((_, reject) =>
            setTimeout(() => reject(new Error('validate-admin-token timeout')), 15000)
          );
          const call = adminSupabase.functions.invoke('validate-admin-token', {
            body: { token: accessToken },
          }) as Promise<{ data: any }>;
          const { data } = await Promise.race([call, timeout]);
          if (data?.valid) {
            setAdminLinkToken(accessToken);
            grantAdminAccess(data.role === 'owner');
            if (mounted) {
              setHasValidToken(true);
              setIsAuthorized(true);
            }
            return true;
          }
          // Real {valid:false} response → invalid token. Only then deny.
          if (data && data.valid === false && mounted && !getAdminSession()) {
            clearAdminSession();
            revokeAdminAccess();
            setIsAuthorized(false);
            return true;
          }
          return false;
        } catch (e) {
          console.warn(`[AdminAccessGuard] validation attempt ${attempt} failed`, e);
          return false;
        }
      };

      (async () => {
        // Up to 3 attempts (15s each) before giving up; if all fail and no
        // session/flag exists, fall back to BlogPage. Network blips no longer
        // kick a valid secret link to the block page.
        for (let i = 1; i <= 3; i++) {
          if (!mounted) return;
          const resolved = await validateOnce(i);
          if (resolved) return;
          if (i < 3) await new Promise((r) => setTimeout(r, 1500));
        }
        if (mounted && !getAdminSession()) {
          revokeAdminAccess();
          setIsAuthorized(false);
        }
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
      window.removeEventListener('storage', handler);
      window.removeEventListener('admin-session-change', handler);
    };
  }, []);

  // Loading
  if (isAuthorized === null) {
    if (getAccessTokenFromURL() || getAdminSession() || hasAdminAccessFlag() || getAdminLinkToken()) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Verifying access...</p>
          </div>
        </div>
      );
    }
    return <BlogPage />;
  }

  // Authorized: render admin panel / login page
  if (isAuthorized) {
    const session = getAdminSession();
    // If the user has a session but is on the login route, redirect to admin home
    if (isLoginRoute() && session) {
      return <Navigate to="/admin" replace />;
    }
    // If NO session and NOT on login route → redirect to login (preserve token in URL is unnecessary, flag is stored)
    if (!session && !isLoginRoute()) {
      return <Navigate to="/admin/auth" replace />;
    }
    return <>{children}</>;
  }

  // Not authorized
  return <BlogPage />;
}

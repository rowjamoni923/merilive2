import { useState, useEffect, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import BlogPage from "@/pages/BlogPage";
import { Navigate, useLocation } from "react-router-dom";
import { getAdminSession, getAdminSessionToken, clearAdminSession } from "@/utils/adminSession";
import { grantAdminAccess, setAdminLinkToken } from "@/utils/adminAccessStorage";
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
    const decideSync = () => {
      const session = getAdminSession();
      const accessToken = getAccessTokenFromURL();
      if (!mounted) return;
      if (isLoginRoute()) {
        // STRICT: secret link mandatory every visit. Allowed only if:
        //  - URL has ?access=<token> AND edge validation succeeds, OR
        //  - User already has an active admin session (post-login refresh)
        // Persistent localStorage flag alone is NOT enough — must come via secret link.
        if (session) {
          setIsAuthorized(true);
        } else if (accessToken) {
          setIsAuthorized(null);
        } else {
          setIsAuthorized(false);
        }
      } else if (session) {
        // Session present but no usable header token → broken state, force re-login.
        const token = getAdminSessionToken();
        if (!token) {
          clearAdminSession();
          setIsAuthorized(false);
        } else {
          setIsAuthorized(true);
        }
      } else if (accessToken) {
        // Came via secret link but not yet logged in → wait for validation.
        setIsAuthorized(null);
      } else {
        setIsAuthorized(false);
      }
    };

    decideSync();

    // Background: validate URL access token (with hard 6s timeout) and persist flag.
    const accessToken = getAccessTokenFromURL();
    if (accessToken) {
      (async () => {
        try {
          const timeout = new Promise<{ data: any }>((_, reject) =>
            setTimeout(() => reject(new Error('validate-admin-token timeout')), 6000)
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
          } else if (mounted) {
            setIsAuthorized(false);
          }
        } catch (e) {
          console.warn('[AdminAccessGuard] token validation failed/timed out', e);
          if (mounted && !getAdminSession()) setIsAuthorized(false);
        }
      })();
    }

    // Listen for session changes (login/logout in other tabs)
    const handler = () => {
      const session = getAdminSession();
      if (session) setIsAuthorized(true);
      else if (!isLoginRoute()) setIsAuthorized(false);
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
    if ((isLoginRoute() && getAccessTokenFromURL()) || getAccessTokenFromURL() || getAdminSession()) {
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

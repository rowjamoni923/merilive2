import { useState, useEffect, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import BlogPage from "@/pages/BlogPage";
import { Navigate } from "react-router-dom";
import { getAdminSession } from "@/utils/adminSession";
import { hasAdminAccessFlag, hasOwnerAccessFlag, grantAdminAccess, setAdminLinkToken } from "@/utils/adminAccessStorage";
import { adminSupabase } from "@/integrations/supabase/adminClient";

/**
 * AdminAccessGuard
 *
 * Now uses the dedicated admin session (independent from user app auth).
 *
 * Logic:
 * 1. URL has `?access=<token>` → validate token via edge function, set flags, allow login page
 * 2. Has admin session → allow admin panel
 * 3. On /admin/auth or /admin/login → always render the login page (regardless of session)
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

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      try {
        // 1. Validate URL access token (gates admin panel discovery)
        const accessToken = getAccessTokenFromURL();
        if (accessToken) {
          try {
            const { data } = await adminSupabase.functions.invoke('validate-admin-token', {
              body: { token: accessToken },
            });
            if (data?.valid) {
              setAdminLinkToken(accessToken);
              grantAdminAccess(data.role === 'owner');
              if (mounted) setHasValidToken(true);
            }
          } catch (e) {
            console.warn('[AdminAccessGuard] token validation failed', e);
          }
        }

        // 2. Check admin session
        const session = getAdminSession();

        if (mounted) {
          if (session) {
            setIsAuthorized(true);
          } else if (isLoginRoute() && (accessToken || hasAdminAccessFlag() || hasOwnerAccessFlag())) {
            // Allow rendering login form
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
          }
        }
      } catch (e) {
        console.error('[AdminAccessGuard] verify error', e);
        if (mounted) setIsAuthorized(false);
      }
    };

    verify();

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
    if (isLoginRoute() || hasAdminAccessFlag() || hasOwnerAccessFlag() || getAccessTokenFromURL()) {
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
    // If the user has a session but is on the login route, redirect to admin home
    if (isLoginRoute() && getAdminSession()) {
      return <Navigate to="/admin" replace />;
    }
    return <>{children}</>;
  }

  // Not authorized
  return <BlogPage />;
}

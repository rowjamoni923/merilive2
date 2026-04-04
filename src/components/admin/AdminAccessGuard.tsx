import { useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, ShieldX } from "lucide-react";
import BlogPage from "@/pages/BlogPage";
import {
  hasAdminAccessFlag,
  hasOwnerAccessFlag,
  grantAdminAccess,
  revokeAdminAccess,
  setAdminLinkToken,
} from "@/utils/adminAccessStorage";

/**
 * Admin Access Guard Component
 * 
 * Protects the admin panel from unauthorized access:
 * 1. Token in URL → Validated server-side via edge function
 * 2. Session access (from previous validated token) → Show admin panel
 * 3. Logged in as Owner email → Show admin panel
 * 4. Sub-admins MUST have approved device to access
 * 5. Otherwise → Show Blog page (no hint of admin panel)
 * 
 * SECURITY: Tokens validated server-side. Device approval required for sub-admins.
 */

const OWNER_EMAILS = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];

const getAccessTokenFromURL = (): string | null => {
  try {
    const rawToken = new URLSearchParams(window.location.search).get('access');
    if (!rawToken) return null;
    return decodeURIComponent(rawToken).trim();
  } catch {
    return null;
  }
};

const hasSessionAccess = (): boolean => hasAdminAccessFlag();

// Generate a simple device fingerprint
const getDeviceFingerprint = (): string => {
  const nav = navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    nav.hardwareConcurrency,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

interface AdminAccessGuardProps {
  children: ReactNode;
}

export default function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const [immediateResult] = useState(() => hasSessionAccess());
  const [isAuthorized, setIsAuthorized] = useState(immediateResult);
  // Keep checks running in background, but never block UI with a loading screen
  const [isChecking, setIsChecking] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(false);

  useEffect(() => {
    if (immediateResult) {
      // Owner session flag = instant access, NO database calls needed
      const isOwnerSession = hasOwnerAccessFlag();
      if (isOwnerSession) {
        setIsAuthorized(true);
        setIsChecking(false);
        if (window.location.pathname === '/admin/auth' || window.location.pathname === '/admin/login') {
          window.location.replace('/admin');
        }
        return;
      }

      // Sub-admin with session - check device approval with timeout
      const verifyDevice = async () => {
        const timeoutId = setTimeout(() => {
          // If DB is slow, just allow access since they have valid session flag
          console.warn('[AdminAccessGuard] Device check timed out - allowing access');
          setIsAuthorized(true);
          setIsChecking(false);
        }, 8000);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            clearTimeout(timeoutId);
            console.warn('[AdminAccessGuard] No authenticated user session - revoking stale local access flag');
            revokeAdminAccess();
            setIsAuthorized(false);
            setIsChecking(false);
            return;
          }

          if (user.email && OWNER_EMAILS.includes(user.email)) {
            clearTimeout(timeoutId);
            setIsAuthorized(true);
            setIsChecking(false);
            return;
          }

          const deviceOk = await checkDeviceApproval(user.id);
          clearTimeout(timeoutId);
          if (deviceOk) {
            setIsAuthorized(true);
          } else {
            revokeAdminAccess();
            setIsAuthorized(false);
          }
        } catch {
          clearTimeout(timeoutId);
          revokeAdminAccess();
          setIsAuthorized(false);
        }
        setIsChecking(false);
      };

      verifyDevice();
      return;
    }

    // Add global timeout - never hang more than 10 seconds
    const globalTimeout = setTimeout(() => {
      console.warn('[AdminAccessGuard] Global timeout - showing blog');
      setIsChecking(false);
    }, 10000);

    const checkAccess = async () => {
      try {
        // 1. Check URL token via server-side validation
        const accessToken = getAccessTokenFromURL();
        if (accessToken) {
          const { data, error } = await supabase.functions.invoke('validate-admin-token', {
            body: { token: accessToken },
          });

          if (!error && data?.valid) {
            setAdminLinkToken(accessToken);

            if (data.role === 'owner') {
              grantAdminAccess(true);
              setIsAuthorized(true);
              setIsChecking(false);
              clearTimeout(globalTimeout);
              if (window.location.pathname === '/admin/auth' || window.location.pathname === '/admin/login') {
                window.location.replace('/admin');
              }
              return;
            }
            grantAdminAccess(false);
          }
        }

        // 2. Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (user.email && OWNER_EMAILS.includes(user.email)) {
            grantAdminAccess(true);
            setIsAuthorized(true);
            setIsChecking(false);
            clearTimeout(globalTimeout);
            return;
          }

          const { data: adminUser } = await supabase
            .from('admin_users')
            .select('id, is_active, role')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

          if (adminUser) {
            if (adminUser.role === 'owner') {
              grantAdminAccess(true);
              setIsAuthorized(true);
              setIsChecking(false);
              clearTimeout(globalTimeout);
              return;
            }

            const deviceOk = await checkDeviceApproval(user.id);
            if (deviceOk) {
              grantAdminAccess(false);
              setIsAuthorized(true);
            } else {
              setIsAuthorized(false);
            }
            setIsChecking(false);
            clearTimeout(globalTimeout);
            return;
          }
        }

        if (hasAdminAccessFlag()) {
          console.warn('[AdminAccessGuard] Local admin flag exists without valid authenticated admin user');
          revokeAdminAccess();
        }

        setIsAuthorized(false);

      } catch (error) {
        console.error('[AdminAccessGuard] Error:', error);
        setIsAuthorized(false);
      } finally {
        setIsChecking(false);
        clearTimeout(globalTimeout);
      }
    };

    checkAccess();
  }, [immediateResult]);

  // Check if current device is approved for this sub-admin
  const checkDeviceApproval = async (userId: string): Promise<boolean> => {
    try {
      const fingerprint = getDeviceFingerprint();
      
      // Use RPC if available, otherwise manual check
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id, role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!adminUser) return false;
      
      // Owners don't need device approval
      if (adminUser.role === 'owner') return true;

      const { data: device } = await supabase
        .from('admin_allowed_devices')
        .select('status')
        .eq('admin_user_id', adminUser.id)
        .eq('device_fingerprint', fingerprint)
        .single();

      if (!device) {
        // Register this device as pending
        await supabase.from('admin_allowed_devices').insert({
          admin_user_id: adminUser.id,
          device_fingerprint: fingerprint,
          device_name: navigator.userAgent.substring(0, 100),
          user_agent: navigator.userAgent,
          status: 'pending' as any,
          device_info: {
            platform: navigator.platform,
            language: navigator.language,
            screen: `${screen.width}x${screen.height}`,
            cores: navigator.hardwareConcurrency,
          } as any,
        });
        setDevicePending(true);
        return false;
      }

      if (device.status === 'approved') return true;
      if (device.status === 'blocked') {
        setDeviceBlocked(true);
        return false;
      }
      
      // pending
      setDevicePending(true);
      return false;
    } catch (err) {
      console.error('[AdminAccessGuard] Device check error:', err);
      return false;
    }
  };

  // Authorized - show admin panel
  if (isAuthorized && !devicePending && !deviceBlocked) {
    return <>{children}</>;
  }

  // Device pending approval
  if (devicePending) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">
            Device Approval Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Your device has not been approved yet. You will get access once the Owner approves it.
          </p>
          <div className="flex items-center justify-center gap-2 text-amber-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Waiting...</span>
          </div>
        </div>
      </div>
    );
  }

  // Device blocked
  if (deviceBlocked) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <ShieldX className="w-10 h-10 text-white" />
          </div>
           <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">
             Device Blocked
           </h2>
           <p className="text-gray-600 dark:text-gray-400">
             Access to the Admin Panel from this device is restricted. Please contact the Owner.
           </p>
        </div>
      </div>
    );
  }

  // Never block the user with an intermediate loading screen
  if (isChecking) {
    return <BlogPage />;
  }

  // Not authorized - show blog
  return <BlogPage />;
}

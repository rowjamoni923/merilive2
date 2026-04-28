import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import useAdminAccess from "@/hooks/useAdminAccess";
import { hasOwnerAccessFlag } from "@/utils/adminAccessStorage";
import { PremiumSpinner } from "@/components/ui/premium-spinner";

// First accessible path map for sub-admins based on hub keys
const HUB_FIRST_PATH: Record<string, string> = {
  'user-hub': '/admin/user-management',
  'agency-hub': '/admin/agencies',
  'level-hub': '/admin/level-tiers',
  'vip-hub': '/admin/vip-management',
  'visual-hub': '/admin/frames',
  'finance-hub': '/admin/coins',
  'trader-hub': '/admin/coin-traders',
  'game-hub': '/admin/game-settings',
  'content-hub': '/admin/banners',
  'party-hub': '/admin/party-rooms',
  'moderation-hub': '/admin/support-tickets',
  'settings-hub': '/admin/settings',
};

/**
 * Route-level guard for sub-admin access control.
 * Wraps individual admin routes and checks if the current user has access to the required hub.
 * Owners bypass all checks. Sub-admins without access are redirected to /admin.
 */

// Map each admin route path segment to its required hub key
const ROUTE_HUB_MAP: Record<string, string | string[]> = {
  // User System
  'user-hub': 'user-hub',
  'user-management': 'user-hub',
  'users': 'user-hub',
  'host-applications': 'user-hub',
  'host-search': 'user-hub',
  'hosts': 'user-hub',
  'face-verification': 'user-hub',
  'blocked': 'user-hub',
  'live-bans': 'user-hub',
  'permanent-ban': 'user-hub',
  'country-distribution': 'user-hub',
  'face-violations': 'user-hub',
  'moderation': 'user-hub',
  'user-reports': 'user-hub',

  // Agency System
  'agency-hub': 'agency-hub',
  'agencies': 'agency-hub',
  'agency-policy': 'agency-hub',
  'commissions': 'agency-hub',
  'commission-calculator': 'agency-hub',
  // Pricing Hub is the unified destination for legacy commissions, call-settings,
  // commission-calculator and helper-diamond-pricing routes. Any sub-admin who
  // historically owned ANY of those areas (agency, finance settings, or trader/helper)
  // must keep access after the redirect collapses them into /admin/pricing-hub.
  'pricing-hub': ['agency-hub', 'settings-hub', 'trader-hub', 'finance-hub'],

  // Level & VIP
  'level-management': 'level-hub',
  'level-tiers': 'level-hub',
  'level-privileges': 'level-hub',
  'feature-levels': 'level-hub',
  'vip-management': 'vip-hub',
  'vip-medals': 'vip-hub',
  'vip-privileges': 'vip-hub',
  'noble-cards': 'vip-hub',
  'ranking-rewards': 'vip-hub',

  // Visual Assets
  'visual-assets': 'visual-hub',
  'frames': 'visual-hub',
  'role-frames': 'visual-hub',
  'entry-effects': 'visual-hub',
  'entry-banners': 'visual-hub',
  'entry-bars': 'visual-hub',
  'entry-name-bars': 'visual-hub',
  'vehicle-entrances': 'visual-hub',
  'chat-bubbles': 'visual-hub',
  'animation-store': 'visual-hub',
  'verified-badges': 'visual-hub',

  // Finance
  'finance': 'finance-hub',
  'coins': 'finance-hub',
  'topup-system': 'finance-hub',
  'manual-topup': 'finance-hub',
  'payment-gateways': 'finance-hub',
  'topup-payment-methods': 'finance-hub',
  'withdrawals': 'finance-hub',
  'balance-deduction': 'finance-hub',
  'transfer-history': 'finance-hub',
  'recharge-history': 'finance-hub',
  'recharge-campaigns': 'finance-hub',
  'transfer-scheduler': 'finance-hub',
  'payroll-orders': 'finance-hub',
  'shop': 'finance-hub',
  'gifts': 'finance-hub',
  'gift-transactions': 'finance-hub',
  'reward-claims': 'finance-hub',
  'user-beans-exchange': 'finance-hub',
  'host-conversion': 'finance-hub',

  // Traders
  'coin-trader-hub': 'trader-hub',
  'coin-traders': 'trader-hub',
  'helper-management': 'trader-hub',
  'helper-applications': 'trader-hub',
  'helper-requests': 'trader-hub',
  'helper-orders': 'trader-hub',
  'level5-helpers': 'trader-hub',
  'helper-diamond-pricing': 'trader-hub',

  // Games
  'game-management': 'game-hub',
  'game-settings': 'game-hub',
  'game-providers': 'game-hub',
  'game-server': 'game-hub',
  'game-leaderboard': 'game-hub',

  // Content
  'content-management': 'content-hub',
  'banners': 'content-hub',
  'content': 'content-hub',
  'streams': 'content-hub',
  'recordings': 'content-hub',
  'reels': 'content-hub',
  'leaderboard-management': 'content-hub',
  'tasks-settings': 'content-hub',
  'rewards-management': 'content-hub',

  // Party
  'party-management': 'party-hub',
  'party-rooms': 'party-hub',
  'party-backgrounds': 'party-hub',
  'party-banners': 'party-hub',
  'room-welcome-messages': 'party-hub',

  // Support & Moderation
  'contact-violations': 'moderation-hub',
  'support-tickets': 'moderation-hub',
  'gmail-support': 'moderation-hub',
  'chat-inspector': 'moderation-hub',
  'number-sharing': 'moderation-hub',
  'reports': 'moderation-hub',
  'logs': 'moderation-hub',
  'error-logs': 'moderation-hub',

  // Content extras
  'onboarding-slides': 'settings-hub',
  'rating-rewards': 'content-hub',

  // Dashboard deep links
  'online-users': 'user-hub',
  'today-calls': 'settings-hub',

  // Settings
  'call-settings': 'settings-hub',
  'push-broadcast': 'settings-hub',
  'notice-broadcast': 'settings-hub',
  'email-broadcast': 'settings-hub',
  'notification-templates': 'settings-hub',
  'app-settings-hub': 'settings-hub',
  'settings': 'settings-hub',
  'branding': 'settings-hub',
  'invitation-settings': 'settings-hub',
  'popup-banners': 'settings-hub',
  'app-version': 'settings-hub',
  'device-management': 'settings-hub',
  'allowed-links': 'settings-hub',
  'icon-registry': 'visual-hub',
  'beauty-filters': 'visual-hub',
  'parcel-management': 'settings-hub',
  'landing-page': 'settings-hub',
  'theme-manager': 'settings-hub',
};

// Owner-only routes - sub-admins can NEVER access these
const OWNER_ONLY_ROUTES = ['sub-admins', 'agora-settings', 'blueprint', 'device-approvals'];

interface AdminRouteGuardProps {
  children: ReactNode;
  routeSegment?: string; // The route segment to check (e.g., "users", "withdrawals")
}

export default function AdminRouteGuard({ children, routeSegment }: AdminRouteGuardProps) {
  // Owner flag short-circuit: never block owner routes behind async permission checks
  if (hasOwnerAccessFlag()) return <>{children}</>;

  const { isOwner, hasHubAccess, isLoading } = useAdminAccess();

  // While permissions are loading, show premium loader (instead of blank outlet)
  if (isLoading) {
    return (
      <div className="min-h-[40vh] w-full flex items-center justify-center" role="status" aria-live="polite" aria-label="Loading admin page access">
        <PremiumSpinner size="lg" />
      </div>
    );
  }
  // Owners can access everything
  if (isOwner) return <>{children}</>;

  // If no route segment provided, sub-admins are redirected to their first accessible page
  // (Dashboard is owner-only for sub-admins)
  if (!routeSegment) return <Navigate to="/admin" replace />;

  // Owner-only route check
  if (OWNER_ONLY_ROUTES.includes(routeSegment)) {
    return <Navigate to="/admin" replace />;
  }

  // Check hub access
  const requiredHub = ROUTE_HUB_MAP[routeSegment];
  if (!requiredHub) {
    // No hub mapping = sub-admins cannot access (Dashboard, Logs, Reports, etc.)
    return <Navigate to="/admin" replace />;
  }

  const allowed = Array.isArray(requiredHub)
    ? requiredHub.some((hub) => hasHubAccess(hub))
    : hasHubAccess(requiredHub);

  if (allowed) {
    return <>{children}</>;
  }

  // No access - redirect to admin dashboard
  return <Navigate to="/admin" replace />;
}

/**
 * Guard for the /admin index (Dashboard) route.
 * Owners see the dashboard. Sub-admins are redirected to their first accessible page.
 */
export function SubAdminDashboardGuard({ children }: { children: ReactNode }) {
  if (hasOwnerAccessFlag()) return <>{children}</>;

  const { isOwner, accessibleHubs, isLoading } = useAdminAccess();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] w-full flex items-center justify-center">
        <PremiumSpinner size="lg" />
      </div>
    );
  }

  if (isOwner) return <>{children}</>;

  // Sub-admin: redirect to first accessible hub page
  if (accessibleHubs.length > 0) {
    const firstHub = accessibleHubs[0];
    const firstPath = HUB_FIRST_PATH[firstHub] || '/admin';
    if (firstPath !== '/admin') {
      return <Navigate to={firstPath} replace />;
    }
  }

  // No hubs accessible at all - show empty state
  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center text-slate-400">
      <div className="text-center">
        <p className="text-lg font-semibold mb-2">No Access</p>
        <p className="text-sm">You don't have access to any sections. Contact the Owner.</p>
      </div>
    </div>
  );
}

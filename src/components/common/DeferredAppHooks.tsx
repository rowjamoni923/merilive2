import { useMemo, forwardRef } from "react";
import { useLocation } from "react-router-dom";
import { useSingleDeviceSession } from "@/hooks/useSingleDeviceSession";
import { useAppResumeHandler } from "@/hooks/useAppResumeHandler";
import { useLevelPrivilegeAutoEquip } from "@/hooks/useLevelPrivilegeAutoEquip";
import { useAdminBroadcastSync } from "@/hooks/useAdminBroadcastSync";
import { useNotifications } from "@/hooks/useNotifications";
import { SessionDebugOverlay } from "@/components/debug/SessionDebugOverlay";
import { queryClient } from "@/lib/queryClient";

/**
 * Pkg91: GLOBAL `notifications` realtime subscription mount.
 * Side-effect only — return value ignored. Bridges:
 *  - `app_sync` rows → `window 'app-sync'` (drives instant My Beans / My
 *    Diamond / orders / parcels / etc. on every route — Profile, Tasks,
 *    Recharge, LiveStream, PartyRoom, Games, Reels, Withdraw, …)
 *  - `incoming_call` → `window 'incoming-call-notification'` (Pkg84)
 *  - `pk_*` → `window 'pk-notification'` (Pkg82d)
 * Previously useNotifications() was only mounted by Chat / Home / Header
 * bell, so users on any other route saw stale balances/orders until they
 * manually refreshed or switched routes. This component is gated on
 * non-admin routes only and lives at a stable position in the tree so its
 * hook order never shifts.
 */
const GlobalNotificationsMount = () => {
  useNotifications();
  return null;
};

/**
 * Deferred hooks bridge - lazy loaded after first paint
 * Contains heavy hooks that are NOT needed for initial render
 * Uses forwardRef to avoid React warnings when used with Suspense
 */
const DeferredAppHooks = forwardRef<HTMLDivElement, { userId: string | null }>(({ userId }, _ref) => {
  const location = useLocation();
  const isAdminRoute = useMemo(() => location.pathname.startsWith('/admin'), [location.pathname]);
  const singleDeviceUserId = isAdminRoute ? null : userId;
  const appResumeUserId = isAdminRoute ? null : userId;

  useSingleDeviceSession(singleDeviceUserId);
  useAppResumeHandler(appResumeUserId, queryClient);
  useLevelPrivilegeAutoEquip(singleDeviceUserId);
  // Pkg36: instant admin → app sync (web + native, all routes)
  useAdminBroadcastSync();

  if (isAdminRoute) return null;
  return (
    <>
      <GlobalNotificationsMount />
      <SessionDebugOverlay userId={singleDeviceUserId} />
    </>
  );
});

DeferredAppHooks.displayName = 'DeferredAppHooks';

export default DeferredAppHooks;





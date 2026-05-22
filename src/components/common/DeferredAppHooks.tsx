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
  // Pkg91: GLOBAL notifications subscription on every authenticated user route.
  // Previously useNotifications() was only mounted by Chat / Home / Header-bell —
  // so on Profile / Tasks / Recharge / LiveStream / PartyRoom / Games / Reels /
  // Withdraw etc. the user-filtered `notifications` realtime channel was NOT
  // active → `app_sync` rows emitted by DB triggers (profiles balance, orders,
  // parcels, helpers, transfers, …) did NOT fire `window 'app-sync'` → My Beans /
  // My Diamond and other server-driven UI only refreshed after manual refresh or
  // route switch. Mounting here keeps that subscription always-on for the whole
  // session, restoring true instant server→UI sync without polling. Side-effect
  // only (return value ignored); dispatches `app-sync` / `incoming-call-notification` /
  // `pk-notification` window events that downstream listeners consume. Duplicate
  // dispatches when Chat/Bell also mount it are idempotent (absolute snapshots).
  if (!isAdminRoute) {
    // Conditional call is fine here — `isAdminRoute` derives from a stable
    // routing primitive and the component re-mounts on auth/admin transitions.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useNotifications();
  }

  return isAdminRoute ? null : <SessionDebugOverlay userId={singleDeviceUserId} />;
});

DeferredAppHooks.displayName = 'DeferredAppHooks';

export default DeferredAppHooks;



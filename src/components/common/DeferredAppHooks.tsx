import { useMemo, forwardRef, memo } from "react";
import { useLocation } from "react-router-dom";
import { useSingleDeviceSession } from "@/hooks/useSingleDeviceSession";
import { useAppResumeHandler } from "@/hooks/useAppResumeHandler";
import { useLevelPrivilegeAutoEquip } from "@/hooks/useLevelPrivilegeAutoEquip";
import { useAdminBroadcastSync } from "@/hooks/useAdminBroadcastSync";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import { useInAppUpdate } from "@/hooks/useInAppUpdate";
import { useHibernationCheck } from "@/hooks/useHibernationCheck";
import { useMemoryPressureGuard } from "@/hooks/useMemoryPressureGuard";
import { useStreamQualityDirector } from "@/hooks/useStreamQualityDirector";
import { useConversationShortcuts } from "@/hooks/useConversationShortcuts";
import { useNativeImageInterceptor } from "@/hooks/useNativeImagePrefetch";
import { useNativeGiftDispatcher } from "@/hooks/useNativeGiftDispatcher";
import { useNativeEntryDispatcher } from "@/hooks/useNativeEntryDispatcher";
import { SessionDebugOverlay } from "@/components/debug/SessionDebugOverlay";
import FeedbackDialog from "@/components/common/FeedbackDialog";
import { queryClient } from "@/lib/queryClient";

/**
 * Pkg91 / Phase-3 C1: the GLOBAL `notifications` realtime subscription
 * mount lives in CallProvider now (so it loads WITHOUT Suspense and runs
 * even on public pages where DeferredAppHooks is gated off). This used
 * to live here, but the Suspense window left a small dead period where
 * `incoming_call` notification rows arrived but no listener was active.
 * Side-effect only — return value ignored. Bridges:
 *  - `app_sync` rows → `window 'app-sync'`
 *  - `incoming_call` → `window 'incoming-call-notification'` (Pkg84)
 *  - `pk_*` → `window 'pk-notification'` (Pkg82d)
 */

/**
 * Deferred hooks bridge - lazy loaded after first paint
 * Contains heavy hooks that are NOT needed for initial render
 * Uses forwardRef to avoid React warnings when used with Suspense
 */
const DeferredAppHooks = memo(forwardRef<HTMLDivElement, { userId: string | null }>(({ userId }, _ref) => {
  const location = useLocation();
  const isAdminRoute = useMemo(() => location.pathname.startsWith('/admin'), [location.pathname]);
  const singleDeviceUserId = isAdminRoute ? null : userId;
  const appResumeUserId = isAdminRoute ? null : userId;

  useSingleDeviceSession(singleDeviceUserId);
  useAppResumeHandler(appResumeUserId, queryClient);
  useLevelPrivilegeAutoEquip(singleDeviceUserId);
  // Pkg36: instant admin → app sync (web + native, all routes)
  useAdminBroadcastSync();
  // Pkg221: native Android background-sync worker (no-op on web/iOS)
  useBackgroundSync();
  // Pkg224 / M19: Google Play In-App Updates (Android only, no-op elsewhere)
  useInAppUpdate();
  // Pkg235 / M29: Android 12+ app-hibernation prompt (no-op on web/iOS)
  useHibernationCheck();
  // Pkg244: Android onTrimMemory → evict inactive RQ cache & SW caches under RAM pressure
  useMemoryPressureGuard();
  // Pkg443 Phase-3: unified thermal+memory+network → 'stream:quality-hint' event
  useStreamQualityDirector();
  // Pkg248: dynamic Conversation shortcuts + Direct Share (top 4 recent DMs)
  useConversationShortcuts();
  // Pkg428 / Developer Options: native Glide image interceptor (Android-only,
  // gated by `nativeImageLoader` flag in Developer Options screen). Reacts
  // live to flag toggles — no rebuild needed to flip on/off.
  useNativeImageInterceptor();
  // Pkg438 Phase B: Android-native gift + entry overlay dispatchers.
  // Flag-gated (`nativeGiftAnim` / `nativeEntryAnim`) + Android-only +
  // plugin-availability checked — full no-op on web / iOS / older APKs,
  // so the existing WebView gift/entry pipeline is unaffected.
  useNativeGiftDispatcher();
  useNativeEntryDispatcher(userId);


  if (isAdminRoute) return null;
  return (
    <>
      <GlobalNotificationsMount />
      <SessionDebugOverlay userId={singleDeviceUserId} />
      {/* Pkg255: shake-to-feedback dialog (Android shake → feedback, no-op on web/iOS until openFeedbackDialog() is called) */}
      <FeedbackDialog />
    </>
  );
}));

DeferredAppHooks.displayName = 'DeferredAppHooks';

export default DeferredAppHooks;





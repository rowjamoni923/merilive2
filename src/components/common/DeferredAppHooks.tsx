import { useMemo, forwardRef } from "react";
import { useLocation } from "react-router-dom";
import { useSingleDeviceSession } from "@/hooks/useSingleDeviceSession";
import { useAppResumeHandler } from "@/hooks/useAppResumeHandler";
import { useLevelPrivilegeAutoEquip } from "@/hooks/useLevelPrivilegeAutoEquip";
import { queryClient } from "@/App";

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
  
  return null;
});

DeferredAppHooks.displayName = 'DeferredAppHooks';

export default DeferredAppHooks;

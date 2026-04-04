import { useMemo, forwardRef } from "react";
import { useSingleDeviceSession } from "@/hooks/useSingleDeviceSession";
import { useAppResumeHandler } from "@/hooks/useAppResumeHandler";
import { queryClient } from "@/App";

/**
 * Deferred hooks bridge - lazy loaded after first paint
 * Contains heavy hooks that are NOT needed for initial render
 * Uses forwardRef to avoid React warnings when used with Suspense
 */
const DeferredAppHooks = forwardRef<HTMLDivElement, { userId: string | null }>(({ userId }, _ref) => {
  const isAdminRoute = useMemo(() => window.location.pathname.startsWith('/admin'), []);
  const singleDeviceUserId = isAdminRoute ? null : userId;
  
  useSingleDeviceSession(singleDeviceUserId);
  useAppResumeHandler(userId, queryClient);
  
  return null;
});

DeferredAppHooks.displayName = 'DeferredAppHooks';

export default DeferredAppHooks;

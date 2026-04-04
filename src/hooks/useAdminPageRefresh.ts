import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

/**
 * Custom hook that triggers a callback when navigating to an admin page
 * This ensures data is refreshed on every navigation without requiring a browser refresh
 * 
 * IMPORTANT: This hook is designed to avoid infinite loops by:
 * 1. Using refs to track mount state and last pathname
 * 2. Not including the callback in dependencies (using ref instead)
 * 3. Only triggering refresh on actual pathname changes after initial mount
 * 
 * @param onRefresh - Callback function to execute on page load/navigation
 */
export const useAdminPageRefresh = (
  onRefresh: () => void | Promise<void>
) => {
  const location = useLocation();
  const isFirstMount = useRef(true);
  const lastPathname = useRef(location.pathname);
  const onRefreshRef = useRef(onRefresh);
  
  // Keep the ref updated with latest callback
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // Always run on first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;
      onRefreshRef.current();
      return;
    }

    // Run when pathname changes (navigation)
    if (lastPathname.current !== location.pathname) {
      lastPathname.current = location.pathname;
      onRefreshRef.current();
    }
  }, [location.pathname]);
};

/**
 * Simplified version that just runs once on mount
 * Use this for pages that don't need navigation-triggered refresh
 */
export const useAdminMount = (onMount: () => void | Promise<void>) => {
  const onMountRef = useRef(onMount);
  
  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  useEffect(() => {
    onMountRef.current();
  }, []);
};

export default useAdminPageRefresh;

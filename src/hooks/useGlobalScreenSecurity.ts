/**
 * Global Screen Security Hook
 * Enables FLAG_SECURE across the entire app to prevent:
 * - Screenshots
 * - Screen Recording
 * - Screen Sharing
 * 
 * The screen will appear BLACK when any capture is attempted.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ScreenSecuritySDK } from '@/sdk/ScreenSecuritySDK';

// Routes that require screen security (screen appears black on capture)
const PROTECTED_ROUTES = [
  '/',           // Home page
  '/live/',      // Live streams
  '/call',       // Calls
  '/party/',     // Party rooms
  '/profile',    // Profile
  '/discover',   // Discover
  '/chat',       // Chat
];

// Check if current route is protected
const isProtectedRoute = (pathname: string): boolean => {
  // Protect entire app - all routes
  return true;
  
  // Alternative: Only protect specific routes
  // return PROTECTED_ROUTES.some(route => pathname.startsWith(route) || pathname === route);
};

export function useGlobalScreenSecurity() {
  const location = useLocation();
  const isSecureRef = useRef(false);

  useEffect(() => {
    const initSecurity = async () => {
      const shouldProtect = isProtectedRoute(location.pathname);
      
      if (shouldProtect && !isSecureRef.current) {
        console.log('[ScreenSecurity] Enabling secure mode for:', location.pathname);
        const success = await ScreenSecuritySDK.enableSecureMode();
        if (success) {
          isSecureRef.current = true;
          console.log('[ScreenSecurity] ✅ Secure mode enabled - Screenshots/Recording will show BLACK screen');
        }
      } else if (!shouldProtect && isSecureRef.current) {
        console.log('[ScreenSecurity] Disabling secure mode');
        await ScreenSecuritySDK.disableSecureMode();
        isSecureRef.current = false;
      }
    };

    initSecurity();

    // Cleanup on unmount
    return () => {
      // Don't disable on route change - keep app-wide protection
    };
  }, [location.pathname]);

  // Also enable on app visibility change (user returns to app)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !isSecureRef.current) {
        const shouldProtect = isProtectedRoute(location.pathname);
        if (shouldProtect) {
          await ScreenSecuritySDK.enableSecureMode();
          isSecureRef.current = true;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location.pathname]);

  return {
    isSecure: isSecureRef.current,
    enableSecureMode: () => ScreenSecuritySDK.enableSecureMode(),
    disableSecureMode: () => ScreenSecuritySDK.disableSecureMode(),
  };
}

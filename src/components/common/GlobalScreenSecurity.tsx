/**
 * Global Screen Security Component
 *
 * Disabled by product decision:
 * We must not force black-screen capture behavior app-wide.
 */

import { useEffect } from 'react';
import { ScreenSecuritySDK } from '@/sdk/ScreenSecuritySDK';

export function GlobalScreenSecurity() {
  useEffect(() => {
    // Ensure any previously enabled secure mode is turned off
    void ScreenSecuritySDK.disableSecureMode();

    return () => {
      void ScreenSecuritySDK.disableSecureMode();
    };
  }, []);

  return null;
}

export default GlobalScreenSecurity;

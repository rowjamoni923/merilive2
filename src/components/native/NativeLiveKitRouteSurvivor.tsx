/**
 * NativeLiveKitRouteSurvivor — Phase 1A.2 Step 3.
 *
 * Mounted once inside <BrowserRouter>. On every in-app navigation
 * (PUSH or REPLACE), if a native LiveKit session is currently bound at
 * the Application scope, opts that Room into surviving the next
 * Activity destroy so the destination screen's plugin instance can
 * adopt it and skip a fresh connect().
 *
 * Back button (POP) is treated as a real user-initiated leave and is
 * intentionally NOT marked for survival — the existing teardown path
 * runs unchanged.
 *
 * Web/iOS: no-op (getActiveSession returns inactive on those platforms).
 * Default OFF: when no native session is bound, this component fires
 * nothing.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

export const NativeLiveKitRouteSurvivor = () => {
  const location = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = location.pathname;

    // Skip on initial mount and on POP (back button = real leave).
    if (prev === null) return;
    if (prev === location.pathname) return;
    if (navType === 'POP') return;
    if (!isNativeLiveKitAvailable()) return;

    // Professional no-leak policy: live/party/call sessions must end on
    // explicit page exit/background teardown. Never preserve a hidden native
    // Room across route changes; that is how stale camera sessions survive.
  }, [location.pathname, navType]);

  return null;
};

export default NativeLiveKitRouteSurvivor;

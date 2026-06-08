/**
 * NativeLiveKitRouteSurvivor — no-leak guard.
 *
 * Older builds opted native LiveKit rooms into surviving route changes.
 * The current professional policy is stricter: live / party / private call
 * media must be owned by the visible Android native SDK screen only.
 * Therefore this component intentionally never preserves a hidden Room.
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

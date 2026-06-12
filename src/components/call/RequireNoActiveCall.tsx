import { ReactNode, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCall } from './CallProvider';
import { toast as sonnerToast } from 'sonner';

/**
 * Route guard: blocks entering live-stream / party rooms while a private
 * call is in progress (calling / ringing / connected). Professional apps
 * (Chamet/Bigo/WhatsApp) NEVER allow two real-time media sessions to
 * stack on top of each other — entering a live room while on a call
 * caused overlapping UIs (call screen + live UI showing together) and
 * camera/mic ownership races. This wrapper enforces "one session at a
 * time" at the route boundary.
 *
 * Behavior: if a call is active when the user lands on the route OR a
 * call becomes active while inside, we bounce back to the previous
 * screen and surface a toast. ActiveCallScreen (rendered globally by
 * CallProvider on the top layer) becomes the only visible UI.
 */
export function RequireNoActiveCall({ children }: { children: ReactNode }) {
  const { isInCall } = useCall();
  const navigate = useNavigate();
  const toastedRef = useRef(false);

  useEffect(() => {
    if (!isInCall) {
      toastedRef.current = false;
      return;
    }
    if (toastedRef.current) return;
    toastedRef.current = true;
    sonnerToast.message('You are on a call', {
      description: 'End the call to enter live streams or party rooms.',
    });
    // Defer one tick so React Router finishes the current transition before
    // we navigate back — prevents "navigate during render" warnings.
    const t = setTimeout(() => navigate(-1), 0);
    return () => clearTimeout(t);
  }, [isInCall, navigate]);

  if (isInCall) return null;
  return <>{children}</>;
}

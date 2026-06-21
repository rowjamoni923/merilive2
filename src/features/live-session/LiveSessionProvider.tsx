/**
 * LiveSessionProvider
 * -------------------
 * Step 1 of the "persistent session container" pattern (user's "shirt পরে বাজারে
 * যাওয়া" model). This Provider mounts ONCE for the entire Go Live flow and
 * holds:
 *
 *   1. A persistentCameraSession refcount → keeps the raw camera/mic stream
 *      alive across phase swaps (preview → broadcast → ended). Without this,
 *      the refcount briefly hits 0 when PreviewPhase unmounts before
 *      BroadcastPhase mounts, causing the camera to release and restart.
 *
 *   2. The current `phase` state. Children swap UI by reading this — they
 *      MUST NOT use react-router navigate() between phases. Phase changes are
 *      pure local state updates, so the WebView never reloads and native
 *      plugins (LiveKitPlugin) never see a "page gone" event.
 *
 * What this Provider does NOT do yet (future steps):
 *   - Own the LiveKit room directly. For now, phases continue to manage
 *     LiveKit via the existing nativeLiveKitController; because the Provider
 *     holds a camera refcount, the native preview track is reused instead of
 *     being torn down and recreated.
 *   - Render the actual UI. Phases (PreviewPhase, BroadcastPhase, EndedPhase)
 *     render the existing GoLive / LiveStream components for now; the next
 *     migration step moves their internals up into this Provider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  acquireCameraSession,
  type CameraSessionHandle,
} from '@/lib/persistentCameraSession';

export type LiveSessionPhase = 'preview' | 'broadcast' | 'ended';

export type LiveSessionContextValue = {
  phase: LiveSessionPhase;
  setPhase: (next: LiveSessionPhase) => void;
  /** Stream/room id once the broadcast actually starts. */
  streamId: string | null;
  setStreamId: (id: string | null) => void;
  /** True while the Provider holds a camera refcount. */
  cameraHeld: boolean;
};

const LiveSessionContext = createContext<LiveSessionContextValue | null>(null);

export function LiveSessionProvider({
  initialPhase = 'preview',
  initialStreamId = null,
  children,
}: {
  initialPhase?: LiveSessionPhase;
  initialStreamId?: string | null;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<LiveSessionPhase>(initialPhase);
  const [streamId, setStreamId] = useState<string | null>(initialStreamId);
  const [cameraHeld, setCameraHeld] = useState(false);

  // Hold one persistent camera refcount for the entire session. PreviewPhase
  // and BroadcastPhase may also acquire their own handles; the Provider's
  // handle guarantees the refcount never drops to 0 during phase transitions.
  const handleRef = useRef<CameraSessionHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await acquireCameraSession({ video: true, audio: true });
        if (cancelled) {
          handle.release();
          return;
        }
        handleRef.current = handle;
        setCameraHeld(true);
      } catch (err) {
        // Camera permission denied / no device — phases will surface the
        // error through their own UI. Provider stays alive either way.
        console.warn('[LiveSession] camera acquire failed', err);
      }
    })();
    return () => {
      cancelled = true;
      const h = handleRef.current;
      handleRef.current = null;
      setCameraHeld(false);
      if (h) {
        try {
          h.release();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const setPhaseStable = useCallback((next: LiveSessionPhase) => {
    setPhase((prev) => (prev === next ? prev : next));
  }, []);

  const value = useMemo<LiveSessionContextValue>(
    () => ({
      phase,
      setPhase: setPhaseStable,
      streamId,
      setStreamId,
      cameraHeld,
    }),
    [phase, setPhaseStable, streamId, cameraHeld],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession(): LiveSessionContextValue {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) {
    throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  }
  return ctx;
}

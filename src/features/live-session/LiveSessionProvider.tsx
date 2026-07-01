/**
 * LiveSessionProvider — Delivery 1, real session container.
 *
 * Mounts ONCE for the whole Go Live flow. Holds:
 *   1. A persistentCameraSession refcount so the camera/mic stream never
 *      releases between phases (preview → broadcast → ended).
 *   2. `phase` state. Children swap UI by reading this and MUST NOT
 *      `navigate()` between phases — phase changes are local state, so the
 *      WebView never reloads and native plugins never see a "page gone".
 *   3. The stream id + host state once broadcast begins; LiveStream reads
 *      these instead of useParams/useLocation when running inside the
 *      session.
 *
 * Pages opt in via `useLiveSessionOptional()`. When the hook returns null
 * the page falls back to the legacy navigate()-based flow, so this
 * Provider is purely additive — nothing breaks if a page renders without
 * it.
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
  disposeCameraSessionIfIdle,
  type CameraSessionHandle,
} from '@/lib/persistentCameraSession';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

export type LiveSessionPhase = 'preview' | 'broadcast' | 'ended';

export type LiveHostState = {
  isHost: true;
  title?: string;
  hostInfo?: {
    id: string;
    name: string;
    avatar: string;
    level?: number;
    gender?: string;
    country?: string;
  };
};

export type LiveSessionContextValue = {
  phase: LiveSessionPhase;
  setPhase: (next: LiveSessionPhase) => void;
  streamId: string | null;
  setStreamId: (id: string | null) => void;
  hostState: LiveHostState | null;
  /** Called by GoLive after the stream row is created. Atomically flips
   *  phase to 'broadcast' and stores id + host state in one render. */
  goToBroadcast: (streamId: string, state: LiveHostState) => void;
  /** Called by LiveStream when the host ends the stream. */
  goToEnded: () => void;
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
  const [phase, setPhaseState] = useState<LiveSessionPhase>(initialPhase);
  const [streamId, setStreamId] = useState<string | null>(initialStreamId);
  const [hostState, setHostState] = useState<LiveHostState | null>(null);
  const [cameraHeld, setCameraHeld] = useState(false);

  // Hold one persistent camera refcount for the entire session.
  const handleRef = useRef<CameraSessionHandle | null>(null);

  useEffect(() => {
    // Native Android uses the LiveKitPlugin Camera2 preview surface. Opening a
    // hidden WebView getUserMedia stream here steals/reopens the camera during
    // preview → publish, so the persistent web-session safety net is web-only.
    if (isNativeAndroidApp()) return;

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
          disposeCameraSessionIfIdle();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const setPhase = useCallback((next: LiveSessionPhase) => {
    setPhaseState((prev) => (prev === next ? prev : next));
  }, []);

  const goToBroadcast = useCallback(
    (id: string, state: LiveHostState) => {
      setStreamId(id);
      setHostState(state);
      setPhaseState('broadcast');
    },
    [],
  );

  const goToEnded = useCallback(() => {
    setPhaseState('ended');
  }, []);

  const value = useMemo<LiveSessionContextValue>(
    () => ({
      phase,
      setPhase,
      streamId,
      setStreamId,
      hostState,
      goToBroadcast,
      goToEnded,
      cameraHeld,
    }),
    [phase, setPhase, streamId, hostState, goToBroadcast, goToEnded, cameraHeld],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {/* Global PersistentCameraSurface lives in CallProvider — see
          src/components/media/PersistentCameraSurface.tsx. It bridges
          every route swap (preview → broadcast → ended) without unmounting. */}
      {children}
    </LiveSessionContext.Provider>
  );
}

/** Required form — throws if not inside the Provider. */
export function useLiveSession(): LiveSessionContextValue {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) {
    throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  }
  return ctx;
}

/** Optional form — returns null when the page is rendered outside the
 *  Provider so legacy navigate()-based flows keep working. */
export function useLiveSessionOptional(): LiveSessionContextValue | null {
  return useContext(LiveSessionContext);
}

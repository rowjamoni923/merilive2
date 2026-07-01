/**
 * LiveSessionProvider — Delivery 1, real session container.
 *
 * Mounts ONCE for the whole Go Live flow. Holds:
 *   1. `phase` state. Children swap UI by reading this and MUST NOT
 *      `navigate()` between phases — phase changes are local state, so the
 *      WebView never reloads and native plugins never see a "page gone".
 *   2. The stream id + host state once broadcast begins; LiveStream reads
 *      these instead of useParams/useLocation when running inside the
 *      session.
 *
 * Important: this Provider MUST NOT open or hold a hidden camera. The camera
 * belongs only to the visible preview/broadcast screen, otherwise users can
 * leave preview and still see a background camera running above Home.
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
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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
  /** Kept for old callers; always false because Provider no longer opens camera. */
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
      cameraHeld: false,
    }),
    [phase, setPhase, streamId, hostState, goToBroadcast, goToEnded],
  );

  return (
    <LiveSessionContext.Provider value={value}>
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

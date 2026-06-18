/**
 * X1: React hook for the 20-minute hard reconnect cap abandon event.
 *
 *   const abandoned = useReconnectAbandoned('live', streamId);
 *   if (abandoned) showRejoinModal();
 *
 * Powered by livekitHardReconnectCap. Zero Supabase channels, zero polls.
 */
import { useEffect, useState } from 'react';
import type { QualityScope } from '@/lib/livekitConnectionQuality';
import { isHardReconnectAbandoned } from '@/lib/livekitHardReconnectCap';

export interface ReconnectAbandonedState {
  abandoned: boolean;
  durationMs: number | null;
}

const EMPTY: ReconnectAbandonedState = { abandoned: false, durationMs: null };

export function useReconnectAbandoned(
  scope: QualityScope,
  id: string | null | undefined,
): ReconnectAbandonedState {
  const [state, setState] = useState<ReconnectAbandonedState>(() =>
    id ? { abandoned: isHardReconnectAbandoned(scope, id), durationMs: null } : EMPTY,
  );

  useEffect(() => {
    if (!id) {
      setState(EMPTY);
      return;
    }
    setState({ abandoned: isHardReconnectAbandoned(scope, id), durationMs: null });

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ scope: QualityScope; id: string; durationMs: number }>;
      const d = ce?.detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      setState({ abandoned: true, durationMs: d.durationMs });
    };

    window.addEventListener('livekit-reconnect-abandoned', handler);
    return () => window.removeEventListener('livekit-reconnect-abandoned', handler);
  }, [scope, id]);

  return state;
}

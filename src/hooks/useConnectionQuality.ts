/**
 * Pkg101: React hook returning live connection quality for a (scope, id).
 *
 *   const { local, remotes } = useConnectionQuality('call', callId);
 *   // local: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'
 *   // remotes: Record<identity, Quality>
 *
 * Powered by LiveKit's ConnectionQualityChanged — zero Supabase channels,
 * zero polls. See src/lib/livekitConnectionQuality.ts.
 */
import { useEffect, useState } from 'react';
import type {
  ConnectionQualityDetail,
  Quality,
  QualityScope,
} from '@/lib/livekitConnectionQuality';

export interface ConnectionQualityState {
  local: Quality;
  remotes: Record<string, Quality>;
}

const EMPTY: ConnectionQualityState = { local: 'unknown', remotes: {} };

export function useConnectionQuality(
  scope: QualityScope,
  id: string | null | undefined,
): ConnectionQualityState {
  const [state, setState] = useState<ConnectionQualityState>(EMPTY);

  useEffect(() => {
    if (!id) {
      setState(EMPTY);
      return;
    }
    setState(EMPTY);

    const handler = (e: Event) => {
      const ce = e as CustomEvent<ConnectionQualityDetail>;
      const d = ce?.detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      setState({ local: d.local, remotes: { ...d.remotes } });
    };

    window.addEventListener('livekit-connection-quality', handler);
    return () => window.removeEventListener('livekit-connection-quality', handler);
  }, [scope, id]);

  return state;
}

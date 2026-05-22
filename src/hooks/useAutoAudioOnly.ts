/**
 * Pkg154: React hook returning auto audio-only state for (scope, id).
 *
 *   const { active, reason } = useAutoAudioOnly('live', streamId);
 *   if (active) showBanner('Switched to audio-only due to poor network');
 *
 * Powered by Pkg154 livekitAutoAudioOnly. Zero Supabase channels, zero polls.
 */
import { useEffect, useState } from 'react';
import type { QualityScope } from '@/lib/livekitConnectionQuality';
import { isAutoAudioOnlyActive } from '@/lib/livekitAutoAudioOnly';

export interface AutoAudioOnlyState {
  active: boolean;
  reason: string | null;
}

const EMPTY: AutoAudioOnlyState = { active: false, reason: null };

export function useAutoAudioOnly(
  scope: QualityScope,
  id: string | null | undefined,
): AutoAudioOnlyState {
  const [state, setState] = useState<AutoAudioOnlyState>(() =>
    id ? { active: isAutoAudioOnlyActive(scope, id), reason: null } : EMPTY,
  );

  useEffect(() => {
    if (!id) {
      setState(EMPTY);
      return;
    }
    setState({ active: isAutoAudioOnlyActive(scope, id), reason: null });

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ scope: QualityScope; id: string; active: boolean; reason: string }>;
      const d = ce?.detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      setState({ active: d.active, reason: d.reason ?? null });
    };

    window.addEventListener('livekit-auto-audio-only', handler);
    return () => window.removeEventListener('livekit-auto-audio-only', handler);
  }, [scope, id]);

  return state;
}

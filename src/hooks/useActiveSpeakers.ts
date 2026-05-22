/**
 * Pkg98: React hook returning the current set of speaking participant
 * identities for a (scope, id) — powered by LiveKit's server-side
 * ActiveSpeakersChanged event. See src/lib/livekitActiveSpeaker.ts.
 *
 * Usage:
 *   const speakers = useActiveSpeakers('party', roomId);
 *   const isSpeaking = (identity: string) => speakers.has(identity);
 *
 * Zero Supabase channels, zero polls. Updates within ~200ms of LiveKit
 * SFU detecting voice activity.
 */
import { useEffect, useState } from 'react';
import type { ActiveSpeakersDetail, SpeakerScope } from '@/lib/livekitActiveSpeaker';

export function useActiveSpeakers(
  scope: SpeakerScope,
  id: string | null | undefined,
): Set<string> {
  const [speakers, setSpeakers] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!id) {
      setSpeakers(new Set());
      return;
    }
    setSpeakers(new Set());

    const handler = (e: Event) => {
      const ce = e as CustomEvent<ActiveSpeakersDetail>;
      const d = ce?.detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      // Always create a new Set so React detects the change (Set identity).
      setSpeakers(new Set(d.identities));
    };

    window.addEventListener('livekit-active-speakers', handler);
    return () => window.removeEventListener('livekit-active-speakers', handler);
  }, [scope, id]);

  return speakers;
}

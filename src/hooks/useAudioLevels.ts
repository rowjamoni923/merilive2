/**
 * Pkg101: React hook returning live audio levels (0..1) per participant.
 *
 *   const levels = useAudioLevels('party', roomId);
 *   const myLevel = levels[myIdentity] ?? 0;
 *
 * Powered by LiveKit's ActiveSpeakersChanged event (Pkg98 registry) which
 * already carries audioLevel per active speaker. Inactive speakers fall
 * back to 0. Zero new Supabase channels, zero polls, zero extra cost.
 *
 * Useful for: voice meter rings around avatars, "🎤 X is loud" tags,
 * party-room speaker bar.
 */
import { useEffect, useState } from 'react';
import type {
  ActiveSpeakersDetail,
  SpeakerScope,
} from '@/lib/livekitActiveSpeaker';

export function useAudioLevels(
  scope: SpeakerScope,
  id: string | null | undefined,
): Record<string, number> {
  const [levels, setLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!id) {
      setLevels({});
      return;
    }
    setLevels({});

    const handler = (e: Event) => {
      const ce = e as CustomEvent<ActiveSpeakersDetail>;
      const d = ce?.detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      // Replace map each tick so inactive speakers drop to 0 implicitly.
      setLevels({ ...d.levels });
    };

    window.addEventListener('livekit-active-speakers', handler);
    return () => window.removeEventListener('livekit-active-speakers', handler);
  }, [scope, id]);

  return levels;
}

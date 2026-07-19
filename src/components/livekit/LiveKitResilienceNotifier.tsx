/**
 * X1 + X2 UI: shared notifier for auto-audio-only flips and 20-min hard
 * reconnect abandons. Mount once per LiveKit surface (live / call / party)
 * and it will surface professional toasts via sonner. Headless — renders
 * nothing.
 *
 * Usage:
 *   <LiveKitResilienceNotifier scope="live"  id={streamId} />
 *   <LiveKitResilienceNotifier scope="call"  id={callId}   />
 *   <LiveKitResilienceNotifier scope="party" id={roomId}   />
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { QualityScope } from '@/lib/livekitConnectionQuality';
import { useAutoAudioOnly } from '@/hooks/useAutoAudioOnly';
import { useReconnectAbandoned } from '@/hooks/useReconnectAbandoned';

interface Props {
  scope: QualityScope;
  id: string | null | undefined;
  /** Optional callback so the host page can trigger a full rejoin flow. */
  onRejoin?: () => void;
}

const TOAST_AUDIO_ONLY = 'lk-auto-audio-only';

export function LiveKitResilienceNotifier({ scope, id, onRejoin }: Props) {
  const audio = useAutoAudioOnly(scope, id);
  const abandoned = useReconnectAbandoned(scope, id);
  const lastAudioActiveRef = useRef(false);

  // X2: surface auto audio-only flips.
  useEffect(() => {
    if (!id) return;
    if (audio.active && !lastAudioActiveRef.current) {
      toast.warning('Switched to audio-only — poor network', {
        id: `${TOAST_AUDIO_ONLY}-${scope}-${id}`,
        duration: 5000,
        description: 'Video will resume automatically when your connection improves.',
      });
    } else if (!audio.active && lastAudioActiveRef.current) {
      toast.success('Connection restored — video resumed', {
      });
    }
    lastAudioActiveRef.current = audio.active;
  }, [audio.active, scope, id]);

  // X1: surface hard reconnect abandon as a persistent, actionable toast.
  useEffect(() => {
    if (!id || !abandoned.abandoned) return;
    const mins = abandoned.durationMs
      ? Math.max(1, Math.round(abandoned.durationMs / 60000))
      : 20;
    toast.error('Connection lost', {
      action: onRejoin
        ? { label: 'Rejoin', onClick: () => onRejoin() }
        : undefined,
    });
  }, [abandoned.abandoned, abandoned.durationMs, scope, id, onRejoin]);

  return null;
}

export default LiveKitResilienceNotifier;

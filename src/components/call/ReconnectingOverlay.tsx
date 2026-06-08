/**
 * ReconnectingOverlay — JS P2 polish
 *
 * Subtle top-center pill shown while LiveKit is mid-reconnect. Driven by the
 * `livekit-call-reconnecting` / `livekit-call-reconnected` window events
 * dispatched from `useLiveKitCall`. Industry pattern (Chamet/Bigo/Olamet):
 * non-blocking inline status so the user knows the freeze is transient and
 * billing is paused, rather than a frozen feed with no explanation.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface Props {
  /** Restrict the overlay to a specific active call. When null, listens to any. */
  callId?: string | null;
}

export function ReconnectingOverlay({ callId }: Props) {
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const matches = (e: Event) => {
      if (!callId) return true;
      const detail = (e as CustomEvent<{ callId?: string }>).detail;
      return !detail?.callId || detail.callId === callId;
    };
    const onStart = (e: Event) => { if (matches(e)) setReconnecting(true); };
    const onEnd = (e: Event) => { if (matches(e)) setReconnecting(false); };

    window.addEventListener('livekit-call-reconnecting', onStart as EventListener);
    window.addEventListener('livekit-call-reconnected', onEnd as EventListener);
    return () => {
      window.removeEventListener('livekit-call-reconnecting', onStart as EventListener);
      window.removeEventListener('livekit-call-reconnected', onEnd as EventListener);
    };
  }, [callId]);

  // Clear when call changes / unmounts.
  useEffect(() => { setReconnecting(false); }, [callId]);

  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          className="absolute top-[120px] left-1/2 -translate-x-1/2 z-[56] flex items-center gap-2 px-3.5 py-2 rounded-full shadow-xl border backdrop-blur-xl bg-black/55 border-white/15"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
          <span className="text-white text-[11px] font-semibold whitespace-nowrap">
            Reconnecting… billing paused
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

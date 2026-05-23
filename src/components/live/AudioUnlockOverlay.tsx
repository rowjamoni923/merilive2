/**
 * Pkg201 — iOS Safari "Tap to enable sound" overlay (M2).
 *
 * Listens to `livekit-audio-playback-blocked` / `-ok` events emitted by
 * `src/lib/livekitAudioUnlock.ts`. When blocked, renders a full-screen
 * tap target that calls `unlockAllAudioPlayback()` from inside the user
 * gesture. Auto-dismisses on success.
 *
 * Mount once near the app root (e.g. inside layouts that contain live /
 * party rooms). It is a no-op when no room is currently audio-blocked,
 * so it is safe to mount everywhere.
 */

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AUDIO_PLAYBACK_BLOCKED_EVENT,
  AUDIO_PLAYBACK_OK_EVENT,
  type AudioPlaybackEventDetail,
  unlockAllAudioPlayback,
} from '@/lib/livekitAudioUnlock';

export function AudioUnlockOverlay() {
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onBlocked = (e: Event) => {
      const detail = (e as CustomEvent<AudioPlaybackEventDetail>).detail;
      if (detail && detail.canPlaybackAudio === false) setBlocked(true);
    };
    const onOk = (e: Event) => {
      const detail = (e as CustomEvent<AudioPlaybackEventDetail>).detail;
      if (detail && detail.canPlaybackAudio === true) setBlocked(false);
    };
    window.addEventListener(AUDIO_PLAYBACK_BLOCKED_EVENT, onBlocked);
    window.addEventListener(AUDIO_PLAYBACK_OK_EVENT, onOk);
    return () => {
      window.removeEventListener(AUDIO_PLAYBACK_BLOCKED_EVENT, onBlocked);
      window.removeEventListener(AUDIO_PLAYBACK_OK_EVENT, onOk);
    };
  }, []);

  const handleUnlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unlockAllAudioPlayback();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {blocked && (
        <motion.button
          type="button"
          onClick={handleUnlock}
          onTouchEnd={handleUnlock}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 backdrop-blur-md"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          aria-label="Tap to enable sound"
        >
          <motion.div
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/5 px-7 py-6 text-center shadow-2xl"
            style={{
              backdropFilter: 'blur(18px) saturate(140%)',
              WebkitBackdropFilter: 'blur(18px) saturate(140%)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.06) inset, 0 18px 60px rgba(236,72,153,0.25)',
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg,#ec4899,#a855f7)',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.18) inset, 0 0 22px rgba(236,72,153,0.55)',
              }}
            >
              <Volume2 className="h-7 w-7 text-white" />
            </motion.div>
            <div className="text-base font-semibold text-white">
              {busy ? 'Enabling sound…' : 'Tap to enable sound'}
            </div>
            <div className="max-w-[240px] text-xs leading-relaxed text-white/70">
              Your phone blocked autoplay. Tap anywhere to start hearing the host.
            </div>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default AudioUnlockOverlay;

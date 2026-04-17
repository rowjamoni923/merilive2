/**
 * Global Audio Unlock
 * 
 * Browsers (especially mobile Safari/Chrome) block <audio> autoplay
 * until the user has interacted with the page. This module installs
 * a one-time interaction listener that "unlocks" audio playback
 * for the rest of the session by playing a silent buffer.
 * 
 * Once unlocked, all subsequent gift/SVGA/entry sounds work without
 * a fresh user gesture.
 */

let unlocked = false;
let unlockPromise: Promise<void> | null = null;

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const tryUnlock = async (): Promise<void> => {
  if (unlocked) return;

  try {
    // 1) HTML5 Audio unlock
    const a = new Audio(SILENT_WAV);
    a.volume = 0.01;
    await a.play().catch(() => {});
    a.pause();
    a.currentTime = 0;

    // 2) WebAudio context unlock (for Howler / WebAudio paths)
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx: AudioContext = new Ctx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      // Close after a short delay to free the context
      setTimeout(() => ctx.close().catch(() => {}), 500);
    }

    unlocked = true;
  } catch {
    /* swallow — will retry on next interaction */
  }
};

const handleInteraction = () => {
  if (unlocked) return;
  void tryUnlock().then(() => {
    if (unlocked) detach();
  });
};

const detach = () => {
  document.removeEventListener('touchstart', handleInteraction);
  document.removeEventListener('touchend', handleInteraction);
  document.removeEventListener('click', handleInteraction);
  document.removeEventListener('keydown', handleInteraction);
};

export const installAudioUnlock = () => {
  if (typeof window === 'undefined' || unlocked) return;
  document.addEventListener('touchstart', handleInteraction, { passive: true });
  document.addEventListener('touchend', handleInteraction, { passive: true });
  document.addEventListener('click', handleInteraction);
  document.addEventListener('keydown', handleInteraction);
};

export const isAudioUnlocked = () => unlocked;

export const ensureAudioUnlocked = async () => {
  if (unlocked) return true;
  if (!unlockPromise) unlockPromise = tryUnlock();
  await unlockPromise;
  unlockPromise = null;
  return unlocked;
};

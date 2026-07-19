import { useCallback, useEffect, useRef } from 'react';
import { ensureAudioUnlocked, isAudioUnlocked } from '@/utils/audioUnlock';

// Sound types
type SoundType = 'ringtone' | 'notification' | 'message' | 'diamond' | 'gift' | 'call-end' | 'call-connect' | 'entrance';

// ─────────────────────────────────────────────────────────────
// GLOBAL SINGLETON AudioContext
// Previously every component that called useSound() created its
// own AudioContext and CLOSED it on unmount — that destroyed
// in-flight sounds (notification/diamond/gift/SVGA chime) and made
// every subsequent sound "break" or never play. We now keep one
// shared context for the whole app and never close it.
// ─────────────────────────────────────────────────────────────
let sharedCtx: AudioContext | null = null;
let sharedGain: GainNode | null = null;

const getCtx = (): AudioContext | null => {
  try {
    if (!sharedCtx) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      sharedCtx = new Ctx();
      sharedGain = sharedCtx!.createGain();
      sharedGain.gain.value = 1.0;
      sharedGain.connect(sharedCtx!.destination);
    }
    if (sharedCtx.state === 'suspended') {
      // Best-effort resume; safe to call even outside a gesture.
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
};

// Apple-style Premium Ringtone (similar to Reflection/Opening)
const playRingtone = (audioContext: AudioContext, gainNode: GainNode) => {
  // Apple-inspired marimba/xylophone-like tones with harmonics
  const notes = [
    { freq: 1046.50, time: 0, duration: 0.15 },
    { freq: 1318.51, time: 0.15, duration: 0.15 },
    { freq: 1567.98, time: 0.30, duration: 0.15 },
    { freq: 2093.00, time: 0.45, duration: 0.20 },
    { freq: 1567.98, time: 0.70, duration: 0.12 },
    { freq: 1318.51, time: 0.85, duration: 0.12 },
    { freq: 1046.50, time: 1.00, duration: 0.15 },
    { freq: 1174.66, time: 1.20, duration: 0.15 },
    { freq: 1318.51, time: 1.40, duration: 0.20 },
    { freq: 1567.98, time: 1.65, duration: 0.25 },
  ];

  const t0 = audioContext.currentTime;
  notes.forEach(({ freq, time, duration }) => {
    const mainOsc = audioContext.createOscillator();
    const mainGain = audioContext.createGain();
    mainOsc.type = 'sine';
    mainOsc.frequency.setValueAtTime(freq, t0 + time);
    mainGain.gain.setValueAtTime(0, t0 + time);
    mainGain.gain.linearRampToValueAtTime(0.35, t0 + time + 0.02);
    mainGain.gain.exponentialRampToValueAtTime(0.01, t0 + time + duration + 0.1);
    mainOsc.connect(mainGain);
    mainGain.connect(gainNode);
    mainOsc.start(t0 + time);
    mainOsc.stop(t0 + time + duration + 0.15);

    const harmonicOsc = audioContext.createOscillator();
    const harmonicGain = audioContext.createGain();
    harmonicOsc.type = 'triangle';
    harmonicOsc.frequency.setValueAtTime(freq * 2, t0 + time);
    harmonicGain.gain.setValueAtTime(0, t0 + time);
    harmonicGain.gain.linearRampToValueAtTime(0.08, t0 + time + 0.01);
    harmonicGain.gain.exponentialRampToValueAtTime(0.001, t0 + time + duration * 0.6);
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(gainNode);
    harmonicOsc.start(t0 + time);
    harmonicOsc.stop(t0 + time + duration + 0.1);

    if (freq < 1500) {
      const undertoneOsc = audioContext.createOscillator();
      const undertoneGain = audioContext.createGain();
      undertoneOsc.type = 'sine';
      undertoneOsc.frequency.setValueAtTime(freq / 2, t0 + time);
      undertoneGain.gain.setValueAtTime(0, t0 + time);
      undertoneGain.gain.linearRampToValueAtTime(0.12, t0 + time + 0.02);
      undertoneGain.gain.exponentialRampToValueAtTime(0.001, t0 + time + duration * 0.8);
      undertoneOsc.connect(undertoneGain);
      undertoneGain.connect(gainNode);
      undertoneOsc.start(t0 + time);
      undertoneOsc.stop(t0 + time + duration + 0.1);
    }
  });
};

const playNotificationSound = (ctx: AudioContext, gainNode: GainNode) => {
  const frequencies = [880, 1108.73, 1318.51];
  const t0 = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.2, t0 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.01, t0 + 0.4);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0 + i * 0.05);
    osc.stop(t0 + 0.5);
  });
};

const playMessageSound = (ctx: AudioContext, gainNode: GainNode) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, t0);
  osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.1);
  g.gain.setValueAtTime(0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.01, t0 + 0.15);
  osc.connect(g);
  g.connect(gainNode);
  osc.start(t0);
  osc.stop(t0 + 0.2);
};

const playDiamondSound = (ctx: AudioContext, gainNode: GainNode) => {
  const frequencies = [1318.51, 1567.98, 2093];
  const t0 = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0 + i * 0.08);
    g.gain.setValueAtTime(0.25, t0 + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.08 + 0.2);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0 + i * 0.08);
    osc.stop(t0 + i * 0.08 + 0.25);
  });
};

const playGiftSound = (ctx: AudioContext, gainNode: GainNode) => {
  const t0 = ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 1500 + Math.random() * 1000;
    osc.frequency.setValueAtTime(baseFreq, t0 + i * 0.05);
    g.gain.setValueAtTime(0.15, t0 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.05 + 0.15);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0 + i * 0.05);
    osc.stop(t0 + i * 0.05 + 0.2);
  }
};

const playCallConnectSound = (ctx: AudioContext, gainNode: GainNode) => {
  const frequencies = [523.25, 659.25, 783.99];
  const t0 = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0 + i * 0.15);
    g.gain.setValueAtTime(0.25, t0 + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.15 + 0.2);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0 + i * 0.15);
    osc.stop(t0 + i * 0.15 + 0.25);
  });
};

const playCallEndSound = (ctx: AudioContext, gainNode: GainNode) => {
  const frequencies = [783.99, 659.25, 523.25];
  const t0 = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0 + i * 0.12);
    g.gain.setValueAtTime(0.2, t0 + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.12 + 0.15);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0 + i * 0.12);
    osc.stop(t0 + i * 0.12 + 0.2);
  });
};

const playEntranceSound = (ctx: AudioContext, gainNode: GainNode) => {
  const t0 = ctx.currentTime;
  // Cinematic "Whoosh" + orchestral chime
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t0);
  osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.8);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.4, t0 + 0.4);
  g.gain.exponentialRampToValueAtTime(0.01, t0 + 1.5);
  osc.connect(g);
  g.connect(gainNode);
  osc.start(t0);
  osc.stop(t0 + 1.6);

  // High-frequency sparkle
  for (let i = 0; i < 8; i++) {
    const sOsc = ctx.createOscillator();
    const sG = ctx.createGain();
    sOsc.type = 'sine';
    sOsc.frequency.setValueAtTime(2000 + Math.random() * 2000, t0 + 0.5 + i * 0.1);
    sG.gain.setValueAtTime(0, t0 + 0.5 + i * 0.1);
    sG.gain.linearRampToValueAtTime(0.1, t0 + 0.5 + i * 0.1 + 0.05);
    sG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5 + i * 0.1 + 0.3);
    sOsc.connect(sG);
    sG.connect(gainNode);
    sOsc.start(t0 + 0.5 + i * 0.1);
    sOsc.stop(t0 + 0.5 + i * 0.1 + 0.4);
  }
};

// Module-level shared ringtone loop — multiple hook instances share one loop
// so even if a component unmounts mid-ring, sound keeps playing for the
// caller surface that is still up. Stops only on explicit stopRingtone().
let ringtoneTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneActive = false;
let ringtoneRefCount = 0;

const playSoundInternal = (type: SoundType) => {
  try {
    // Try to resume context (best-effort) on every play; covers tab-switch suspend.
    const ctx = getCtx();
    if (!ctx || !sharedGain) return;
    // Best-effort: also nudge HTML5 audio unlock so SVGA/gift Howler paths stay alive.
    if (!isAudioUnlocked()) void ensureAudioUnlocked();

    switch (type) {
      case 'ringtone': playRingtone(ctx, sharedGain); break;
      case 'notification': playNotificationSound(ctx, sharedGain); break;
      case 'message': playMessageSound(ctx, sharedGain); break;
      case 'diamond': playDiamondSound(ctx, sharedGain); break;
      case 'gift': playGiftSound(ctx, sharedGain); break;
      case 'call-connect': playCallConnectSound(ctx, sharedGain); break;
      case 'call-end': playCallEndSound(ctx, sharedGain); break;
      case 'entrance': playEntranceSound(ctx, sharedGain); break;
    }
  } catch (error) {
    console.warn('[useSound] play failed:', error);
  }
};

export function useSound() {
  const ownsRingtoneRef = useRef(false);

  const playSound = useCallback((type: SoundType) => {
    playSoundInternal(type);
  }, []);

  const startRingtone = useCallback(() => {
    if (ownsRingtoneRef.current) return;
    ownsRingtoneRef.current = true;
    ringtoneRefCount += 1;
    if (ringtoneActive) return;
    ringtoneActive = true;
    playSoundInternal('ringtone');
    ringtoneTimer = setInterval(() => {
      if (ringtoneActive) playSoundInternal('ringtone');
    }, 2500);
  }, []);

  const stopRingtone = useCallback(() => {
    if (ownsRingtoneRef.current) {
      ownsRingtoneRef.current = false;
      ringtoneRefCount = Math.max(0, ringtoneRefCount - 1);
    }
    if (ringtoneRefCount === 0 && ringtoneActive) {
      ringtoneActive = false;
      if (ringtoneTimer) {
        clearInterval(ringtoneTimer);
        ringtoneTimer = null;
      }
    }
  }, []);

  // Release this hook's ringtone hold on unmount, but NEVER close the shared
  // AudioContext — other surfaces may still be playing sounds.
  useEffect(() => {
    return () => {
      stopRingtone();
    };
  }, [stopRingtone]);

  return { playSound, startRingtone, stopRingtone };
}

// Singleton accessor for non-React callers (kept for backwards compatibility).
let globalSoundInstance: ReturnType<typeof useSound> | null = null;
export function getGlobalSound() {
  if (globalSoundInstance) return globalSoundInstance;
  // Synthesize a stand-alone implementation so non-React callers also work.
  globalSoundInstance = {
    playSound: (type: SoundType) => playSoundInternal(type),
    startRingtone: () => {
      ringtoneRefCount += 1;
      if (ringtoneActive) return;
      ringtoneActive = true;
      playSoundInternal('ringtone');
      ringtoneTimer = setInterval(() => {
        if (ringtoneActive) playSoundInternal('ringtone');
      }, 2500);
    },
    stopRingtone: () => {
      ringtoneRefCount = Math.max(0, ringtoneRefCount - 1);
      if (ringtoneRefCount === 0 && ringtoneActive) {
        ringtoneActive = false;
        if (ringtoneTimer) { clearInterval(ringtoneTimer); ringtoneTimer = null; }
      }
    },
  };
  return globalSoundInstance;
}

export function setGlobalSound(instance: ReturnType<typeof useSound>) {
  globalSoundInstance = instance;
}

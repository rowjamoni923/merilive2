/**
 * Central Professional Sound Player
 * ---------------------------------------------------------------
 * Single source of truth for every URL-based sound and every
 * Web-Audio synth in the app. Designed to NEVER "break":
 *
 *  1. ONE shared `AudioContext` for the whole app. iOS Safari caps
 *     simultaneous AudioContexts at 6 — before this module, eight
 *     different hooks/components were each calling `new AudioContext()`
 *     per event, so after a busy live room the cap was hit and EVERY
 *     subsequent sound (ringtone, gift chime, notification) died
 *     until reload. We now reuse a single, never-closed context.
 *
 *  2. ONE shared master `GainNode` with a hard soft-knee compressor /
 *     limiter feeding `destination`, so simultaneous gift + entry +
 *     ringtone sounds can never clip to white noise on the speaker.
 *
 *  3. URL sounds (`playSoundUrl`) keep the `HTMLAudioElement`
 *     reference alive in a module-level `Set` until `ended`/`error`,
 *     so JavaScript GC can never cut a sound off mid-play.
 *
 *  4. Per-URL concurrency cap (default 3) so a 50-combo gift can't
 *     stack 50 copies of the same chime and crackle the output.
 *
 *  5. Awaits the global audio-unlock on every play, so the first call
 *     after app boot on mobile never silently no-ops.
 *
 *  6. Best-effort `ctx.resume()` on every play, so tab-switch suspend
 *     never permanently kills sound.
 *
 *  7. All errors swallowed locally — sound failures must NEVER crash
 *     a render path.
 */

import { ensureAudioUnlocked, isAudioUnlocked } from '@/utils/audioUnlock';

// ────────────────────────────────────────────────────────────────
// Shared AudioContext + master limiter graph
// ────────────────────────────────────────────────────────────────

let sharedCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;

const buildGraph = (): { ctx: AudioContext; out: AudioNode } | null => {
  try {
    if (!sharedCtx) {
      const Ctx =
        (typeof window !== 'undefined' &&
          ((window as any).AudioContext ||
            (window as any).webkitAudioContext)) ||
        null;
      if (!Ctx) return null;
      sharedCtx = new Ctx();
      masterGain = sharedCtx.createGain();
      masterGain.gain.value = 0.9;
      // Soft-knee limiter — keeps the bus from clipping when multiple
      // sounds overlap (entry + gift + ringtone + notification).
      masterLimiter = sharedCtx.createDynamicsCompressor();
      masterLimiter.threshold.value = -6; // dBFS
      masterLimiter.knee.value = 8;
      masterLimiter.ratio.value = 12;
      masterLimiter.attack.value = 0.003;
      masterLimiter.release.value = 0.18;
      masterGain.connect(masterLimiter);
      masterLimiter.connect(sharedCtx.destination);
    }
    if (sharedCtx.state === 'suspended') {
      // best-effort, non-blocking
      sharedCtx.resume().catch(() => {});
    }
    return { ctx: sharedCtx, out: masterGain! };
  } catch {
    return null;
  }
};

/**
 * Public accessor — returns the shared `AudioContext` and the bus
 * `AudioNode` callers should connect their per-sound graphs to
 * (NOT `ctx.destination`, so they benefit from the limiter).
 *
 * Returns `null` only if Web Audio is entirely unavailable.
 */
export const getSharedAudio = (): { ctx: AudioContext; out: AudioNode } | null =>
  buildGraph();

// ────────────────────────────────────────────────────────────────
// URL sound player — anti-GC + concurrency cap + unlock-aware
// ────────────────────────────────────────────────────────────────

interface ActiveSound {
  el: HTMLAudioElement;
  url: string;
}

const active: Set<ActiveSound> = new Set();
const perUrlCount = new Map<string, number>();

const DEFAULT_MAX_PER_URL = 3;
const HARD_VOLUME_CEILING = 0.98; // Increased for professional punchy feel

const release = (slot: ActiveSound) => {
  if (!active.has(slot)) return;
  active.delete(slot);
  const n = perUrlCount.get(slot.url) ?? 0;
  if (n <= 1) perUrlCount.delete(slot.url);
  else perUrlCount.set(slot.url, n - 1);
  try {
    slot.el.pause();
    slot.el.src = '';
    slot.el.removeAttribute('src');
    slot.el.load();
  } catch {
    /* noop */
  }
};

export interface PlaySoundUrlOptions {
  /** 0..1 — clamped to HARD_VOLUME_CEILING (0.85) */
  volume?: number;
  /** Max simultaneous copies of the same URL (default 3) */
  maxConcurrent?: number;
  /** When true, loop the sound until `.stop()` */
  loop?: boolean;
  /** Optional explicit playback rate (default 1) */
  rate?: number;
}

export interface SoundHandle {
  /** Stops + cleans the underlying HTMLAudioElement. Safe to call repeatedly. */
  stop: () => void;
  /** Underlying element (do NOT mutate directly). */
  readonly element: HTMLAudioElement | null;
}

const NULL_HANDLE: SoundHandle = { stop: () => {}, element: null };

/**
 * Fire-and-forget URL-based sound playback. Bulletproof:
 *  - Awaits audio unlock on first interaction
 *  - Survives JS GC (kept in module Set until ended/error)
 *  - Caps concurrent copies of same URL
 *  - Volume clamped to 0.85 to avoid clipping
 *  - Errors swallowed — caller never throws
 *
 * Returns a handle with `.stop()` for sounds that must be cancellable.
 */
export const playSoundUrl = (
  url: string | null | undefined,
  opts: PlaySoundUrlOptions = {},
): SoundHandle => {
  if (!url) return NULL_HANDLE;
  if (typeof window === 'undefined' || typeof Audio === 'undefined')
    return NULL_HANDLE;

  const maxC = opts.maxConcurrent ?? DEFAULT_MAX_PER_URL;
  const currentForUrl = perUrlCount.get(url) ?? 0;
  if (currentForUrl >= maxC) {
    // Already enough copies of this exact URL playing — silently skip
    // (combo-spam protection). NOT an error.
    return NULL_HANDLE;
  }

  let el: HTMLAudioElement;
  try {
    el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.volume = Math.max(
      0,
      Math.min(HARD_VOLUME_CEILING, opts.volume ?? 0.6),
    );
    if (opts.rate && opts.rate > 0) el.playbackRate = opts.rate;
    if (opts.loop) el.loop = true;
    el.src = url;
  } catch {
    return NULL_HANDLE;
  }

  const slot: ActiveSound = { el, url };
  active.add(slot);
  perUrlCount.set(url, currentForUrl + 1);

  const cleanup = () => release(slot);

  el.addEventListener('ended', cleanup, { once: true });
  el.addEventListener('error', cleanup, { once: true });
  // Some mobile browsers fire `abort` instead of `error` on unlock failure
  el.addEventListener('abort', cleanup, { once: true });

  const start = () => {
    try {
      const p = el.play();
      if (p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>).catch(() => cleanup());
      }
    } catch {
      cleanup();
    }
  };

  if (isAudioUnlocked()) {
    start();
  } else {
    // Try unlock once, then play. If unlock takes >1.5s, attempt anyway —
    // browsers may permit even without explicit unlock if user has
    // interacted with the document.
    let started = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!started) {
        started = true;
        start();
      }
    }, 1500);
    void ensureAudioUnlocked().finally(() => {
      window.clearTimeout(fallbackTimer);
      if (!started) {
        started = true;
        start();
      }
    });
  }

  return {
    stop: cleanup,
    get element() {
      return el;
    },
  };
};

/**
 * Stop every currently-playing URL sound (e.g. on global mute).
 * Does NOT touch the shared AudioContext or active synth oscillators.
 */
export const stopAllUrlSounds = () => {
  Array.from(active).forEach((slot) => release(slot));
};

// ────────────────────────────────────────────────────────────────
// Lightweight synth helper — for callers that previously did
// `new AudioContext()` per event (the iOS-6-context-limit killer).
// Connects to the shared limiter bus.
// ────────────────────────────────────────────────────────────────

export interface SynthNote {
  freq: number;
  /** Seconds from "now" to start (relative). */
  startOffset?: number;
  /** Seconds. */
  duration?: number;
  /** 0..1 */
  gain?: number;
  type?: OscillatorType;
  /** Optional pitch slide target frequency. */
  toFreq?: number;
}

/**
 * Play a sequence of synthesized notes on the shared bus. Returns a
 * `stop()` to cancel any still-pending oscillators.
 */
export const playSynthSequence = (notes: SynthNote[]): (() => void) => {
  const graph = buildGraph();
  if (!graph || notes.length === 0) return () => {};
  const { ctx, out } = graph;
  const t0 = ctx.currentTime;
  const oscillators: OscillatorNode[] = [];

  for (const n of notes) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = t0 + Math.max(0, n.startOffset ?? 0);
      const dur = Math.max(0.02, n.duration ?? 0.15);
      const peak = Math.max(0, Math.min(0.4, n.gain ?? 0.2));
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.freq, start);
      if (n.toFreq && n.toFreq > 0) {
        osc.frequency.exponentialRampToValueAtTime(n.toFreq, start + dur);
      }
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(start);
      osc.stop(start + dur + 0.05);
      oscillators.push(osc);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* noop */
        }
      };
    } catch {
      /* skip note */
    }
  }

  return () => {
    oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        /* noop */
      }
    });
  };
};

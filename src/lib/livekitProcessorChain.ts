/**
 * Pkg206 (M4): Track Processor Chain
 *
 * Generic wrapper around `LocalTrack.setProcessor` that lets callers
 * compose an ordered chain of processor "steps" per track instead of
 * managing a single processor manually.
 *
 * LiveKit currently allows only ONE processor per LocalTrack at a time,
 * so this module resolves the chain into a single effective processor:
 *
 *  - Video chain: picks the highest-priority video step. Steps share the
 *    underlying MediaPipe segmenter, so only one runs at once.
 *    Supported: 'virtual-bg' (image) > 'blur'.
 *
 *  - Audio chain: picks the highest-priority audio step.
 *    Supported: 'krisp-nc' (Krisp Noise Cancellation, when @livekit/krisp-noise-filter
 *    is installed). Falls back to no-op silently if module is missing.
 *
 * Why a "chain" if only one runs?  Because UI layers (settings panel,
 * pre-join, party seat, host top bar) can independently push/pop steps
 * by id without stomping each other. The manager re-resolves the chain
 * on every change and re-applies the winning processor.
 *
 * Zero polling, zero Supabase round-trips, zero new realtime channels.
 * $1400-rule safe.
 */
import type { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import {
  applyVirtualBackground,
  clearVirtualBackground,
  type VirtualBackgroundOptions,
} from './livekitVirtualBackground';

export type AudioStep =
  | { id: string; kind: 'krisp-nc'; priority?: number };

export type VideoStep =
  | { id: string; kind: 'blur'; blurRadius?: number; priority?: number }
  | { id: string; kind: 'virtual-bg'; imageUrl: string; priority?: number };

type AnyTrack = LocalAudioTrack | LocalVideoTrack;

interface ChainEntry {
  track: AnyTrack;
  kind: 'audio' | 'video';
  steps: Map<string, AudioStep | VideoStep>;
  appliedKey: string | null;
}

const chains = new WeakMap<AnyTrack, ChainEntry>();

function ensureEntry(track: AnyTrack, kind: 'audio' | 'video'): ChainEntry {
  let e = chains.get(track);
  if (!e) {
    e = { track, kind, steps: new Map(), appliedKey: null };
    chains.set(track, e);
  }
  return e;
}

function winner<T extends AudioStep | VideoStep>(steps: T[]): T | null {
  if (!steps.length) return null;
  return [...steps].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  )[0];
}

/* -------------------- VIDEO -------------------- */

/** Add/replace a video processor step on the track's chain. */
export async function pushVideoStep(
  track: LocalVideoTrack | null | undefined,
  step: VideoStep,
): Promise<boolean> {
  if (!track) return false;
  const e = ensureEntry(track, 'video');
  e.steps.set(step.id, step);
  return resolveVideo(e);
}

/** Remove a video step by id. */
export async function popVideoStep(
  track: LocalVideoTrack | null | undefined,
  id: string,
): Promise<boolean> {
  if (!track) return false;
  const e = chains.get(track);
  if (!e || e.kind !== 'video') return false;
  if (!e.steps.delete(id)) return true;
  return resolveVideo(e);
}

/** Strip everything for this track. */
export async function clearVideoChain(track: LocalVideoTrack | null | undefined) {
  if (!track) return;
  const e = chains.get(track);
  if (e) e.steps.clear();
  await clearVirtualBackground(track);
  if (e) e.appliedKey = null;
}

async function resolveVideo(e: ChainEntry): Promise<boolean> {
  const w = winner([...e.steps.values()] as VideoStep[]);
  if (!w) {
    if (e.appliedKey) {
      await clearVirtualBackground(e.track as LocalVideoTrack);
      e.appliedKey = null;
    }
    return false;
  }
  const opts: VirtualBackgroundOptions =
    w.kind === 'blur'
      ? { mode: 'blur', blurRadius: w.blurRadius ?? 10 }
      : { mode: 'image', imageUrl: w.imageUrl };
  const key = `${w.kind}:${w.kind === 'blur' ? w.blurRadius ?? 10 : w.imageUrl}`;
  if (key === e.appliedKey) return true;
  const ok = await applyVirtualBackground(e.track as LocalVideoTrack, opts);
  e.appliedKey = ok ? key : null;
  return ok;
}

/* -------------------- AUDIO -------------------- */

async function loadKrisp(): Promise<null | (() => unknown)> {
  try {
    // Optional dep — only present if user installed it.
    const mod: any = await import(/* @vite-ignore */ '@livekit/krisp-noise-filter');
    if (typeof mod?.KrispNoiseFilter === 'function') return mod.KrispNoiseFilter;
    if (typeof mod?.default === 'function') return mod.default;
    return null;
  } catch {
    return null;
  }
}

/** Add/replace an audio processor step on the track's chain. */
export async function pushAudioStep(
  track: LocalAudioTrack | null | undefined,
  step: AudioStep,
): Promise<boolean> {
  if (!track) return false;
  const e = ensureEntry(track, 'audio');
  e.steps.set(step.id, step);
  return resolveAudio(e);
}

/** Remove an audio step by id. */
export async function popAudioStep(
  track: LocalAudioTrack | null | undefined,
  id: string,
): Promise<boolean> {
  if (!track) return false;
  const e = chains.get(track);
  if (!e || e.kind !== 'audio') return false;
  if (!e.steps.delete(id)) return true;
  return resolveAudio(e);
}

/** Strip every audio step. */
export async function clearAudioChain(track: LocalAudioTrack | null | undefined) {
  if (!track) return;
  const e = chains.get(track);
  if (e) {
    e.steps.clear();
    e.appliedKey = null;
  }
  try {
    // @ts-ignore - stopProcessor exists at runtime on LocalAudioTrack
    if (typeof track.stopProcessor === 'function') await track.stopProcessor();
  } catch {
    /* ignore */
  }
}

async function resolveAudio(e: ChainEntry): Promise<boolean> {
  const track = e.track as LocalAudioTrack;
  const w = winner([...e.steps.values()] as AudioStep[]);

  // Strip previous processor first for a clean swap.
  try {
    // @ts-ignore
    if (typeof track.stopProcessor === 'function') await track.stopProcessor();
  } catch {
    /* ignore */
  }

  if (!w) {
    e.appliedKey = null;
    return false;
  }

  if (w.kind === 'krisp-nc') {
    const Krisp = await loadKrisp();
    if (!Krisp) {
      e.appliedKey = null;
      return false;
    }
    try {
      const processor = (Krisp as any)();
      // @ts-ignore - setProcessor exists at runtime
      await track.setProcessor(processor);
      e.appliedKey = 'krisp-nc';
      return true;
    } catch (err) {
      console.warn('[Pkg206] Krisp NC apply failed', err);
      e.appliedKey = null;
      return false;
    }
  }

  return false;
}

/* -------------------- INTROSPECTION -------------------- */

export function getActiveStepId(track: AnyTrack | null | undefined): string | null {
  if (!track) return null;
  const e = chains.get(track);
  return e?.appliedKey ?? null;
}

export function listSteps(
  track: AnyTrack | null | undefined,
): Array<AudioStep | VideoStep> {
  if (!track) return [];
  const e = chains.get(track);
  return e ? [...e.steps.values()] : [];
}

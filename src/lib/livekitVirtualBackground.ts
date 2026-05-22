/**
 * Pkg119: Virtual Background / Background Blur for LiveKit camera tracks
 *
 * Client-only feature — uses @livekit/track-processors (MediaPipe Selfie
 * Segmentation under the hood) as a LocalTrack processor. The processed
 * frames are published to LiveKit instead of the raw camera feed, so all
 * remote participants automatically see the blur/replacement.
 *
 * - No new Supabase Realtime channels, no polls, no cross-user DB reads.
 * - Kill-switch: app_settings.livekit_signaling_enabled.virtual_background
 *   (default OFF — admin opts in).
 * - Graceful fallback: if unsupported (Safari mobile, low-end device, OffscreenCanvas
 *   missing, etc.) we silently no-op so the camera still publishes.
 * - Track-processors run in a Web Worker; CPU cost stays off the main thread.
 *
 * Used by: useLiveKitClient (live), useLiveKitCall (private call),
 *          usePartyRoomWebRTC (party host video). Caller picks the mode via
 *          a simple UI toggle and we apply / remove the processor on the
 *          existing LocalVideoTrack — no track re-publish needed.
 */
import type { LocalVideoTrack } from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';

export type VirtualBackgroundMode = 'none' | 'blur' | 'image';

export interface VirtualBackgroundOptions {
  mode: VirtualBackgroundMode;
  /** Blur radius in px. Default 10 (light), 25 (strong). */
  blurRadius?: number;
  /** Public image URL when mode === 'image'. Must be CORS-enabled. */
  imageUrl?: string;
}

/**
 * Detect browser support for track processors.
 * Requires Worker + OffscreenCanvas + secure context. Mobile Safari < 17
 * lacks OffscreenCanvas, so we skip gracefully.
 */
export function isVirtualBackgroundSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (typeof Worker === 'undefined') return false;
  if (typeof OffscreenCanvas === 'undefined') return false;
  return true;
}

/**
 * Dynamically import track-processors so the ~5MB MediaPipe wasm bundle
 * only loads when the feature is actually used.
 */
async function loadProcessors() {
  try {
    return await import('@livekit/track-processors');
  } catch (err) {
    console.warn('[Pkg119] @livekit/track-processors load failed', err);
    return null;
  }
}

/**
 * Build a processor for the requested mode. Returns null on unsupported / disabled.
 */
async function buildProcessor(opts: VirtualBackgroundOptions) {
  if (opts.mode === 'none') return null;
  const enabled = await isLiveKitEnabled('virtual_background');
  if (!enabled) return null;
  if (!isVirtualBackgroundSupported()) return null;

  const mod = await loadProcessors();
  if (!mod) return null;

  if (opts.mode === 'blur') {
    const radius = typeof opts.blurRadius === 'number' ? opts.blurRadius : 10;
    return mod.BackgroundBlur(radius);
  }
  if (opts.mode === 'image' && opts.imageUrl) {
    return mod.VirtualBackground(opts.imageUrl);
  }
  return null;
}

/**
 * Apply (or remove) virtual background on an existing LocalVideoTrack.
 *
 * Pass mode 'none' to strip any existing processor. Safe to call repeatedly —
 * stops the previous processor before attaching a new one.
 *
 * Returns true if a processor was attached, false if no-op / removed.
 */
export async function applyVirtualBackground(
  track: LocalVideoTrack | null | undefined,
  opts: VirtualBackgroundOptions,
): Promise<boolean> {
  if (!track) return false;

  // Always strip first so switching modes is clean.
  try {
    // @ts-ignore - stopProcessor is on LocalVideoTrack at runtime
    if (typeof track.stopProcessor === 'function') await track.stopProcessor();
  } catch {
    /* ignore */
  }

  const processor = await buildProcessor(opts);
  if (!processor) return false;

  try {
    // @ts-ignore - setProcessor is on LocalVideoTrack at runtime
    await track.setProcessor(processor);
    return true;
  } catch (err) {
    console.warn('[Pkg119] setProcessor failed', err);
    return false;
  }
}

/**
 * Convenience helper: remove any active processor.
 */
export async function clearVirtualBackground(track: LocalVideoTrack | null | undefined) {
  return applyVirtualBackground(track, { mode: 'none' });
}

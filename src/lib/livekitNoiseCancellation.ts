/**
 * Pkg123: Krisp Noise Cancellation for LiveKit microphone tracks
 *
 * Client-only feature — wraps @livekit/krisp-noise-filter as a LocalAudioTrack
 * processor. Strips background noise (typing, fans, traffic, baby cries) before
 * publishing audio to LiveKit, so all remote participants hear a clean voice.
 *
 * - No new Supabase Realtime channels, no polls, no cross-user DB reads.
 * - Kill-switch: app_settings.livekit_signaling_enabled.noise_cancellation
 *   (default OFF — admin opts in).
 * - Graceful fallback: if unsupported (Safari < 16, missing AudioWorklet,
 *   insecure context, etc.) we silently no-op so the raw mic still publishes.
 * - Krisp wasm + worklet runs off the main thread; CPU cost is small.
 *
 * Used by: useLiveKitClient (live), useLiveKitCall (private call),
 *          usePartyRoomWebRTC (party host audio). Caller toggles on/off and
 *          we apply / remove the processor on the existing LocalAudioTrack —
 *          no track re-publish needed.
 */
import type { LocalAudioTrack } from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';
import { nativeLiveKitController } from './nativeLiveKitController';
import { isNativeLiveKitAvailable } from './nativeLiveKitGate';

export interface NoiseCancellationOptions {
  /** True to enable Krisp, false to strip any active processor. */
  enabled: boolean;
}

/**
 * Detect support. Native Android routes to the Kotlin noise-suppression
 * module (WebRTC AudioProcessing NS + LiveKit Android SDK filter where
 * available). Web requires AudioContext + AudioWorklet + WASM + secure ctx.
 */
export function isNoiseCancellationSupported(): boolean {
  if (isNativeLiveKitAvailable()) return true;
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return false;
  if (!AC.prototype || !('audioWorklet' in AC.prototype)) return false;
  if (typeof WebAssembly === 'undefined') return false;
  return true;
}

/**
 * Native counterpart for hosts running the Capacitor LiveKit publisher.
 * Routes through nativeLiveKitController. Honors the same Pkg123 kill-switch.
 * Returns true when applied, false when unsupported / disabled.
 */
export async function applyNoiseCancellationNative(opts: NoiseCancellationOptions): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;
  if (opts.enabled) {
    const enabled = await isLiveKitEnabled('noise_cancellation');
    if (!enabled) return false;
  }
  const r = await nativeLiveKitController.setNoiseCancellationEnabled(opts.enabled);
  if (!r.ok) return false;
  return opts.enabled ? r.enabled : true;
}


/**
 * Dynamically import krisp-noise-filter so the wasm bundle (~3MB) only loads
 * when the feature is actually used.
 */
async function loadKrisp() {
  try {
    return await import('@livekit/krisp-noise-filter');
  } catch (err) {
    console.warn('[Pkg123] @livekit/krisp-noise-filter load failed', err);
    return null;
  }
}

/**
 * Build a Krisp processor. Returns null on unsupported / disabled.
 */
async function buildProcessor() {
  const enabled = await isLiveKitEnabled('noise_cancellation');
  if (!enabled) return null;
  if (!isNoiseCancellationSupported()) return null;

  const mod: any = await loadKrisp();
  if (!mod) return null;

  // The package exposes `KrispNoiseFilter()` (factory). Older builds export
  // it as `KrispNoiseFilterFactory` — accept both.
  const factory = mod.KrispNoiseFilter ?? mod.KrispNoiseFilterFactory ?? mod.default;
  if (typeof factory !== 'function') {
    console.warn('[Pkg123] KrispNoiseFilter factory not found in module');
    return null;
  }
  try {
    return factory();
  } catch (err) {
    console.warn('[Pkg123] KrispNoiseFilter factory threw', err);
    return null;
  }
}

/**
 * Apply (or remove) Krisp noise cancellation on an existing LocalAudioTrack.
 *
 * Pass enabled:false to strip any existing processor. Safe to call repeatedly —
 * stops the previous processor before attaching a new one.
 *
 * Returns true if a processor was attached, false if no-op / removed.
 */
export async function applyNoiseCancellation(
  track: LocalAudioTrack | null | undefined,
  opts: NoiseCancellationOptions,
): Promise<boolean> {
  if (!track) return false;

  // Always strip first so toggling is clean.
  try {
    // @ts-ignore - stopProcessor is on LocalAudioTrack at runtime
    if (typeof track.stopProcessor === 'function') await track.stopProcessor();
  } catch {
    /* ignore */
  }

  if (!opts.enabled) return false;

  const processor = await buildProcessor();
  if (!processor) return false;

  try {
    // @ts-ignore - setProcessor is on LocalAudioTrack at runtime
    await track.setProcessor(processor);
    return true;
  } catch (err) {
    console.warn('[Pkg123] setProcessor failed', err);
    return false;
  }
}

/** Convenience: remove any active Krisp processor. */
export async function clearNoiseCancellation(track: LocalAudioTrack | null | undefined) {
  return applyNoiseCancellation(track, { enabled: false });
}

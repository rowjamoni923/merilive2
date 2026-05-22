/**
 * Pkg103 — Krisp Noise Suppression for LiveKit
 *
 * Industry-standard background-noise removal (used by Zoom, Discord, Bigo).
 * Wraps a published LocalAudioTrack with `@livekit/krisp-noise-filter`.
 *
 * - Web-only (WASM). Native Android uses LiveKit's built-in WebRTC NS/AEC/AGC.
 * - Lazy dynamic import — does NOT pull WASM into main bundle.
 * - Kill switch: `app_settings.livekit_signaling_enabled.noiseFilter` (default true).
 * - Idempotent: applying twice on same track is a no-op.
 * - Zero new Supabase channels, zero polls.
 */

import { isLiveKitEnabled } from './livekitSignaling';
import type { LocalAudioTrack } from 'livekit-client';

const appliedTracks = new WeakSet<object>();

export async function applyKrispNoiseFilter(track: LocalAudioTrack | null | undefined): Promise<boolean> {
  try {
    if (!track) return false;
    if (appliedTracks.has(track as any)) return true;

    // Native Android: skip (uses native WebRTC noise suppression).
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/merilive-android-native|capacitor/i.test(ua)) return false;
    }

    // Admin kill-switch (reuse 'presence' family — UX-level feature).
    const enabled = await isLiveKitEnabled('presence');
    if (enabled === false) return false;

    const mod = await import('@livekit/krisp-noise-filter');
    if (typeof mod.isKrispNoiseFilterSupported === 'function' && !mod.isKrispNoiseFilterSupported()) {
      console.warn('[Krisp] Not supported in this browser');
      return false;
    }

    // Pkg148: honor user's BVC preference from localStorage (set by Pkg123 dialog).
    let useBVC = false;
    try {
      useBVC = typeof localStorage !== 'undefined' && localStorage.getItem('merilive_noisecancel_v1') === 'bvc';
    } catch { /* ignore */ }

    const processor = mod.KrispNoiseFilter({ useBVC });
    // setProcessor exists on LocalAudioTrack in livekit-client v2
    await (track as any).setProcessor(processor);
    appliedTracks.add(track as any);
    console.log('[Krisp] ✅ Noise filter applied to local audio track');
    return true;
  } catch (e) {
    console.warn('[Krisp] Failed to apply noise filter (non-fatal):', e);
    return false;
  }
}

/** Best-effort: locate the published mic track on a Room and apply Krisp. */
export async function applyKrispToRoomMic(room: any): Promise<boolean> {
  try {
    if (!room?.localParticipant) return false;
    const pubs = Array.from(room.localParticipant.trackPublications.values()) as any[];
    const micPub = pubs.find((p) => p?.track?.kind === 'audio' && p?.source === 'microphone');
    if (micPub?.track) return await applyKrispNoiseFilter(micPub.track);
    return false;
  } catch {
    return false;
  }
}

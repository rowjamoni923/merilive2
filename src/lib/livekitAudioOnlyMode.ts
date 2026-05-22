/**
 * Pkg147 — Audio-only viewer mode
 *
 * Pure client-side data-saver toggle. When enabled, the viewer unsubscribes
 * from every remote camera/screen-share video publication and keeps audio
 * flowing. Setting persists in localStorage; useLiveKitClient applies it on
 * connect and on every new TrackSubscribed event.
 *
 * - Zero new Supabase channels, zero polls, zero cross-user reads.
 * - Industry-standard pattern (Zoom Low Bandwidth, Twitch Audio-only, YouTube data saver).
 * - Local-only; host's own publishing is untouched.
 */
import type { Room, RemoteParticipant, RemoteTrackPublication } from "livekit-client";

const STORAGE_KEY = "merilive_audio_only_v1";
export const AUDIO_ONLY_CHANGED_EVENT = "livekit-audio-only-changed";

export function isAudioOnlyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAudioOnlyEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
  try {
    window.dispatchEvent(new CustomEvent(AUDIO_ONLY_CHANGED_EVENT, { detail: { enabled } }));
  } catch {
    // ignore
  }
}

export function applyAudioOnlyToRoom(room: Room | null | undefined, enabled: boolean): void {
  if (!room) return;
  try {
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
        // Only touch video publications. Audio stays subscribed.
        // @ts-ignore — Track.Kind shape varies across livekit-client minor versions
        if (pub.kind !== "video") return;
        try {
          pub.setSubscribed(!enabled);
        } catch {
          // ignore
        }
      });
    });
  } catch {
    // ignore
  }
}

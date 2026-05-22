/**
 * Pkg149 — Adaptive video quality selector (Phase 2 #6)
 *
 * Lets a viewer cap the simulcast layer they receive from every remote
 * camera/screen-share publication. LiveKit publishes 3 layers (low/medium/high);
 * the SFU forwards only the requested layer → real bandwidth savings.
 *
 * - localStorage-persisted, per-user, per-device.
 * - Pure client SFU control: zero Supabase channels, zero polls, zero cross-user reads.
 * - Industry-standard pattern (YouTube 240p/480p/720p, Zoom HD toggle).
 */
import { VideoQuality, type Room, type RemoteParticipant, type RemoteTrackPublication } from "livekit-client";

export type VideoQualityChoice = "auto" | "low" | "medium" | "high";

const STORAGE_KEY = "merilive_video_quality_v1";
export const VIDEO_QUALITY_CHANGED_EVENT = "livekit-video-quality-changed";

const VALID: ReadonlySet<VideoQualityChoice> = new Set(["auto", "low", "medium", "high"]);

export function getVideoQualityChoice(): VideoQualityChoice {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) as VideoQualityChoice | null;
    return v && VALID.has(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setVideoQualityChoice(choice: VideoQualityChoice): void {
  if (typeof window === "undefined") return;
  try {
    if (choice === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(VIDEO_QUALITY_CHANGED_EVENT, { detail: { choice } }));
  } catch {
    // ignore
  }
}

/** Map UI choice → LiveKit VideoQuality enum. 'auto' falls back to HIGH so the SFU adapts via simulcast. */
export function resolveVideoQuality(choice: VideoQualityChoice): VideoQuality {
  switch (choice) {
    case "low":
      return VideoQuality.LOW;
    case "medium":
      return VideoQuality.MEDIUM;
    case "high":
    case "auto":
    default:
      return VideoQuality.HIGH;
  }
}

/** Walk every remote video publication and apply the resolved quality. */
export function applyVideoQualityToRoom(room: Room | null | undefined, choice: VideoQualityChoice): void {
  if (!room) return;
  const quality = resolveVideoQuality(choice);
  try {
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.kind !== "video") return;
        try {
          pub.setVideoQuality?.(quality);
        } catch {
          // ignore
        }
      });
    });
  } catch {
    // ignore
  }
}

export const VIDEO_QUALITY_LABELS: Record<VideoQualityChoice, string> = {
  auto: "Auto",
  low: "240p",
  medium: "480p",
  high: "720p+",
};

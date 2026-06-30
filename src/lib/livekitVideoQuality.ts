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

/**
 * 2026-06-30 — Manual quality selection PERMANENTLY DISABLED (owner directive).
 *
 * Pro live-streaming apps (Chamet/Bigo/Olamet/Poppo) never expose a video-
 * resolution picker to viewers. Quality adapts automatically via simulcast +
 * the network/thermal quality-hint auto-tuner. Any stale localStorage value
 * from older builds is ignored and cleared on read so users coming back
 * from a previous version don't get stuck on a forced low layer.
 */
export function getVideoQualityChoice(): VideoQualityChoice {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  return "auto";
}

export function setVideoQualityChoice(_choice: VideoQualityChoice): void {
  // No-op: manual selection disabled. Auto-tuner is the only quality authority.
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

/** Pkg-quality-log: ring-buffer of every quality decision (UI pick, auto-cap apply,
 * auto-cap skip). Read with `getVideoQualityLog()` from devtools or admin debug
 * panels. Keeps the last 50 entries — enough to diagnose a stutter complaint
 * without holding memory. */
export interface VideoQualityLogEntry {
  ts: number;
  source: 'manual' | 'auto-cap' | 'auto-cap-skipped' | 'apply';
  /** Effective LiveKit VideoQuality (LOW=0/MEDIUM=1/HIGH=2) or 'n/a'. */
  quality: VideoQuality | 'n/a';
  /** Number of publications actually updated (0 when skipped). */
  affected: number;
  reason: string;
}
const QUALITY_LOG: VideoQualityLogEntry[] = [];
const QUALITY_LOG_MAX = 50;
export const VIDEO_QUALITY_LOG_EVENT = 'livekit-video-quality-log';
function recordQualityEvent(entry: Omit<VideoQualityLogEntry, 'ts'>): void {
  const full: VideoQualityLogEntry = { ts: Date.now(), ...entry };
  QUALITY_LOG.push(full);
  if (QUALITY_LOG.length > QUALITY_LOG_MAX) QUALITY_LOG.shift();
  try {
    // eslint-disable-next-line no-console
    console.info('[livekit-quality]', full.source, {
      q: full.quality,
      affected: full.affected,
      reason: full.reason,
    });
  } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(VIDEO_QUALITY_LOG_EVENT, { detail: full }));
    }
  } catch { /* ignore */ }
}
export function getVideoQualityLog(): readonly VideoQualityLogEntry[] {
  return QUALITY_LOG.slice();
}
export function clearVideoQualityLog(): void { QUALITY_LOG.length = 0; }

/** True when the user explicitly picked a layer (not "auto"). When true, the
 * auto-tuner MUST NOT downgrade further — viewers should not be silently
 * dropped to 240p when they explicitly asked for 720p. */
export function isManualQualityChoice(choice: VideoQualityChoice): boolean {
  return choice === 'low' || choice === 'medium' || choice === 'high';
}

/** Walk every remote video publication and apply the resolved quality. */
export function applyVideoQualityToRoom(room: Room | null | undefined, choice: VideoQualityChoice): void {
  if (!room) return;
  const quality = resolveVideoQuality(choice);
  let affected = 0;
  try {
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.kind !== 'video') return;
        try {
          pub.setVideoQuality?.(quality);
          affected += 1;
        } catch {
          // ignore
        }
      });
    });
  } catch {
    // ignore
  }
  recordQualityEvent({
    source: 'apply',
    quality,
    affected,
    reason: `user-choice=${choice}`,
  });
}

/**
 * Pkg443 — Apply a quality CAP to every remote video pub.
 *
 * Unlike `applyVideoQualityToRoom` (which mirrors the user's chosen layer),
 * this lowers each publication to AT MOST `cap` while leaving lower
 * subscriptions untouched. Used by the Quality-Hint auto-tuner to react
 * to network/thermal pressure without overriding a user who already chose
 * a lower layer manually.
 *
 * 2026-06-30: respects `isManualQualityChoice` — if the viewer explicitly
 * picked a layer, we DO NOT auto-cap further. Prevents the "viewer sees
 * blur even after selecting 720p" regression.
 */
export function applyVideoQualityCapToRoom(
  room: Room | null | undefined,
  cap: VideoQuality,
  opts?: { userChoice?: VideoQualityChoice; reason?: string },
): void {
  if (!room) return;
  const userChoice = opts?.userChoice ?? getVideoQualityChoice();
  const reason = opts?.reason ?? 'quality-hint';
  if (isManualQualityChoice(userChoice)) {
    recordQualityEvent({
      source: 'auto-cap-skipped',
      quality: 'n/a',
      affected: 0,
      reason: `${reason}; manual user-choice=${userChoice} wins`,
    });
    return;
  }
  let affected = 0;
  try {
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.kind !== 'video') return;
        try {
          // VideoQuality enum: LOW=0, MEDIUM=1, HIGH=2 — lower the cap if needed.
          const current = (pub.videoQuality as VideoQuality | undefined);
          if (current === undefined || current > cap) {
            pub.setVideoQuality?.(cap);
            affected += 1;
          }
        } catch {
          // ignore
        }
      });
    });
  } catch {
    // ignore
  }
  recordQualityEvent({
    source: 'auto-cap',
    quality: cap,
    affected,
    reason,
  });
}


export const VIDEO_QUALITY_LABELS: Record<VideoQualityChoice, string> = {
  auto: "Auto",
  low: "240p",
  medium: "480p",
  high: "720p+",
};

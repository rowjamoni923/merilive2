/**
 * Pkg150 — Selective video subscription (Phase 2 #7)
 *
 * For large party rooms, viewers' phones can't decode 10+ simulcast videos at
 * once. This helper keeps audio for EVERY remote participant (so the room
 * still "sounds full") but only subscribes video for the top-N priority
 * participants — host + recent active speakers. Other video pubs are
 * unsubscribed → SFU stops sending those streams → real bandwidth savings.
 *
 * Industry pattern: Zoom "Active Speaker View", Bigo Live multi-guest grid,
 * Discord stage video grid. Audio is cheap; video is the bandwidth hog.
 *
 * - localStorage-persisted per device.
 * - Pure client SFU sub control: zero Supabase channels, zero polls, zero cross-user reads.
 * - Pkg147 (audio-only) still wins when enabled: it unsubscribes ALL video.
 */
import type { Room, RemoteParticipant, RemoteTrackPublication } from "livekit-client";

const STORAGE_KEY = "merilive_selective_sub_v1";
export const SELECTIVE_SUB_CHANGED_EVENT = "livekit-selective-sub-changed";

export interface SelectiveSubConfig {
  enabled: boolean;
  /** Max number of remote videos to keep subscribed at once. 0 = unlimited. */
  maxVideo: number;
}

const DEFAULT: SelectiveSubConfig = { enabled: false, maxVideo: 6 };

export function getSelectiveSubConfig(): SelectiveSubConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<SelectiveSubConfig>;
    return {
      enabled: !!parsed.enabled,
      maxVideo:
        typeof parsed.maxVideo === "number" && parsed.maxVideo >= 0 && parsed.maxVideo <= 32
          ? Math.floor(parsed.maxVideo)
          : DEFAULT.maxVideo,
    };
  } catch {
    return DEFAULT;
  }
}

export function setSelectiveSubConfig(next: Partial<SelectiveSubConfig>): void {
  if (typeof window === "undefined") return;
  const merged = { ...getSelectiveSubConfig(), ...next };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(
      new CustomEvent<SelectiveSubConfig>(SELECTIVE_SUB_CHANGED_EVENT, { detail: merged }),
    );
  } catch {
    // ignore
  }
}

export interface ApplySelectiveSubOpts {
  /** Identities that MUST stay subscribed (e.g. party host). */
  pinned?: string[];
  /** Identities currently or recently speaking (highest priority after pinned). */
  recentSpeakers?: string[];
}

/**
 * Walk every remote video publication; keep first `maxVideo` (by priority)
 * subscribed, unsubscribe the rest. Audio is never touched.
 */
export function applySelectiveSubscriptions(
  room: Room | null | undefined,
  config: SelectiveSubConfig,
  opts: ApplySelectiveSubOpts = {},
): void {
  if (!room || !config.enabled) return;
  if (config.maxVideo <= 0) return;

  try {
    const pinnedSet = new Set(opts.pinned ?? []);
    const speakerSet = new Set(opts.recentSpeakers ?? []);

    // Build priority-ordered identity list.
    const all: RemoteParticipant[] = [];
    room.remoteParticipants.forEach((p) => all.push(p));

    all.sort((a, b) => {
      const ap = pinnedSet.has(a.identity) ? 0 : speakerSet.has(a.identity) ? 1 : 2;
      const bp = pinnedSet.has(b.identity) ? 0 : speakerSet.has(b.identity) ? 1 : 2;
      if (ap !== bp) return ap - bp;
      // Stable secondary sort by identity for deterministic behavior.
      return a.identity.localeCompare(b.identity);
    });

    const keepIdentities = new Set(all.slice(0, config.maxVideo).map((p) => p.identity));

    all.forEach((p) => {
      const keep = keepIdentities.has(p.identity);
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.kind !== "video") return;
        try {
          pub.setSubscribed(keep);
        } catch {
          // ignore
        }
      });
    });
  } catch {
    // ignore
  }
}

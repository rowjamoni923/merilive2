/**
 * Pkg152 — Dynamic publish-layer (simulcast) config for hosts.
 *
 * Phase 3 #10. Lets the host choose how many spatial layers their camera
 * publishes (low / medium / high / ultra) — saves uplink for low-end devices.
 *
 * 📱 PORTRAIT CAMERA ONLY: every preset is 9:16 vertical (height > width),
 * Bigo/TikTok/Chamet style. NEVER landscape. Resolution tier may change;
 * aspect ratio NEVER does.
 *
 * Preference is host-local (localStorage) and read at Room construction.
 * Changing the tier only takes effect on the NEXT live start (LiveKit
 * `publishDefaults` are baked at Room creation).
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { VideoPreset } from "livekit-client";

export type PublishLayerTier = "low" | "medium" | "high" | "ultra";

export const PUBLISH_LAYERS_STORAGE_KEY = "merilive_publish_layers_v1";
export const PUBLISH_LAYERS_CHANGED_EVENT = "publish-layers-changed";
// Pkg153: Native Android only — default to ultra (1080x1920 @ 30fps), per user directive.
export const DEFAULT_PUBLISH_LAYER_TIER: PublishLayerTier = "ultra";

export interface PublishLayerConfig {
  tier: PublishLayerTier;
  label: string;
  description: string;
  /** Capture resolution sent to camera (portrait 9:16). */
  resolution: { width: number; height: number; frameRate: number };
  /** Encoding for the BASE (highest) layer published. */
  videoEncoding: { maxBitrate: number; maxFramerate: number };
  /** Lower simulcast layers (in addition to the base). Empty = single layer. */
  simulcastLayers: VideoPreset[];
}

// Portrait preset helper. All layers MUST be 9:16 (height > width).
function p(width: number, height: number, fps: number, bitrate: number): VideoPreset {
  return new VideoPreset(width, height, bitrate, fps);
}

export const PUBLISH_LAYER_PRESETS: Record<PublishLayerTier, PublishLayerConfig> = {
  low: {
    tier: "low",
    label: "Low (data saver)",
    description: "Single 360p layer — best for weak uplink / 3G.",
    resolution: { width: 360, height: 640, frameRate: 24 },
    videoEncoding: { maxBitrate: 500_000, maxFramerate: 24 },
    simulcastLayers: [],
  },
  medium: {
    tier: "medium",
    label: "Medium",
    description: "540p base + 270p layer — balanced.",
    resolution: { width: 540, height: 960, frameRate: 30 },
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
    simulcastLayers: [p(270, 480, 15, 200_000)],
  },
  high: {
    tier: "high",
    label: "High (recommended)",
    description: "720p base + 540p + 360p — full simulcast, default.",
    resolution: { width: 720, height: 1280, frameRate: 30 },
    videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 },
    simulcastLayers: [
      p(540, 960, 30, 1_000_000),
      p(360, 640, 15, 350_000),
    ],
  },
  ultra: {
    tier: "ultra",
    label: "Ultra (premium)",
    description: "1080p base + 720p + 540p — fastest uplink only.",
    resolution: { width: 1080, height: 1920, frameRate: 30 },
    videoEncoding: { maxBitrate: 5_500_000, maxFramerate: 30 },
    simulcastLayers: [
      p(720, 1280, 30, 2_000_000),
      p(540, 960, 30, 800_000),
    ],
  },
};

export const PUBLISH_LAYER_TIERS: PublishLayerTier[] = ["low", "medium", "high", "ultra"];

function isTier(v: unknown): v is PublishLayerTier {
  return typeof v === "string" && (PUBLISH_LAYER_TIERS as string[]).includes(v);
}

export function getPublishLayerTier(): PublishLayerTier {
  if (typeof window === "undefined") return DEFAULT_PUBLISH_LAYER_TIER;
  try {
    const raw = window.localStorage.getItem(PUBLISH_LAYERS_STORAGE_KEY);
    if (isTier(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_PUBLISH_LAYER_TIER;
}

export function setPublishLayerTier(tier: PublishLayerTier): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUBLISH_LAYERS_STORAGE_KEY, tier);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(PUBLISH_LAYERS_CHANGED_EVENT, { detail: { tier } }),
    );
  } catch {
    /* ignore */
  }
}

export function getPublishLayerConfig(tier?: PublishLayerTier): PublishLayerConfig {
  return PUBLISH_LAYER_PRESETS[tier ?? getPublishLayerTier()];
}

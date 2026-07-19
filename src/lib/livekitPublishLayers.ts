/**
 * Pkg152 — Dynamic publish-layer (simulcast) config for hosts.
 *
 * Phase 3 #10. Defines automatic spatial layers for the camera publisher.
 *
 * 📱 PROFESSIONAL CAMERA: capture presets use natural 3:4 sensor framing to
 * avoid digital zoom; renderers use portrait cover/fill for the phone UI.
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
// Pkg153: Native Android only — default to ultra (1080x1440 @ 30fps), no manual selector.
export const DEFAULT_PUBLISH_LAYER_TIER: PublishLayerTier = "ultra";

export interface PublishLayerConfig {
  tier: PublishLayerTier;
  label: string;
  description: string;
  /** Capture resolution sent to camera (natural 3:4, no digital zoom). */
  resolution: { width: number; height: number; frameRate: number };
  /** Encoding for the BASE (highest) layer published. */
  videoEncoding: { maxBitrate: number; maxFramerate: number };
  /** Lower simulcast layers (in addition to the base). Empty = single layer. */
  simulcastLayers: VideoPreset[];
}

// Sensor preset helper. Layers stay portrait but use 3:4 to preserve FOV.
function p(width: number, height: number, fps: number, bitrate: number): VideoPreset {
  return new VideoPreset(width, height, bitrate, fps);
}

export const PUBLISH_LAYER_PRESETS: Record<PublishLayerTier, PublishLayerConfig> = {
  low: {
    tier: "low",
    label: "Low (data saver)",
    description: "Single 540x720 sensor layer — best for weak uplink / 3G.",
    resolution: { width: 540, height: 720, frameRate: 24 },
    videoEncoding: { maxBitrate: 500_000, maxFramerate: 24 },
    simulcastLayers: [],
  },
  medium: {
    tier: "medium",
    label: "Medium",
    description: "720x960 sensor base + 540x720 relay — balanced.",
    resolution: { width: 720, height: 960, frameRate: 30 },
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
    simulcastLayers: [p(540, 720, 24, 500_000)],
  },
  high: {
    tier: "high",
    label: "High (recommended)",
    description: "1080x1440 sensor base + 720x960 relay — HD simulcast.",
    resolution: { width: 1080, height: 1440, frameRate: 30 },
    videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
    simulcastLayers: [
      p(720, 960, 30, 1_400_000),
    ],
  },
  ultra: {
    tier: "ultra",
    label: "Ultra (premium HD)",
    description: "1440x1920 sensor base + 1080x1440 + 720x960 — premium HD clarity.",
    resolution: { width: 1440, height: 1920, frameRate: 30 },
    videoEncoding: { maxBitrate: 6_500_000, maxFramerate: 30 },
    simulcastLayers: [
      p(1080, 1440, 30, 3_500_000),
      p(720, 960, 30, 1_500_000),
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

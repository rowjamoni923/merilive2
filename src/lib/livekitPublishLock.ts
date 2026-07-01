/**
 * LiveKit publish-quality LOCK (Chamet / Bigo / Olamet parity).
 *
 * Mirrors the `LOCK_*` constants in
 * android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt so the
 * native publisher and any JS fallback agree on the EXACT same encoder
 * settings. These values are intentionally fixed — neither the publisher
 * SDK nor the SFU is allowed to silently down-tune the base layer at
 * runtime, so the host video can never go blurry / pixelated mid-stream.
 *
 * Adaptation still happens VIEWER-side via simulcast layer switching
 * (`adaptiveStream` in the viewer's RoomOptions). Weak viewers fetch the
 * 540p or 360p relay instead of dragging the base 720p layer down.
 *
 * If you change a number here, change the matching `LOCK_*` constant in
 * LiveKitPlugin.kt in the SAME commit and rebuild the APK. Mismatched
 * values cause sender/receiver drift and visible pumping.
 */
export const LIVEKIT_PUBLISH_LOCK = {
  // Capture (CameraX) — full-bleed 9:16 portrait, 30 fps, 1080p short-side.
  // Capture aspect == phone display aspect, so renderer FILL is a 1:1 map
  // (no letterbox, no render-time zoom). The sensor's own 4:3→9:16
  // center-crop is the standard FOV every pro live app uses (Chamet/Bigo/
  // Olamet/Holla). Must match LOCK_CAPTURE_* in LiveKitPlugin.kt.
  captureWidth: 1080,
  captureHeight: 1920,
  captureFps: 30,

  // Base layer encoder — 1080p @ 30fps @ 4.5 Mbps. Pinned, never re-tuned.
  // 2026-06-30: lifted from 3.2 → 4.5 Mbps to hit Chamet/Bigo "premium clarity"
  // band. Viewers consistently report a sharper face at this rate on mid-tier
  // Android renderers; SFU still down-relays via simulcast for weak networks.
  maxBitrate: 4_500_000,
  maxFps: 30,
  // Simulcast relays: 720p mid @ 2.2 Mbps, 540p low @ 900 kbps.
  simulcast: true,
} as const;

export type LiveKitPublishLock = typeof LIVEKIT_PUBLISH_LOCK;

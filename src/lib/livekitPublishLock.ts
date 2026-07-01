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
  // Capture (CameraX/Web) — natural 3:4 sensor frame at 1440×1920 for
  // Chamet/Bigo "premium HD" clarity. Higher sensor mode → sharper
  // downscaled encode, no digital zoom (renderers keep sharp video FIT/contain
  // so tall-phone center-crop never makes the face look artificially zoomed).
  captureWidth: 1440,
  captureHeight: 1920,
  captureFps: 30,

  // Base layer encoder — 1440×1920 @ 30fps @ 6.5 Mbps. Pinned, never re-tuned.
  // 2026-07-01: lifted 4.5 → 6.5 Mbps + 1440 sensor mode for premium clarity
  // (removes the "ঘোলাটে/ঝাপসা" soft look users reported). Weak viewers still
  // get 720p/540p via simulcast relays below.
  maxBitrate: 6_500_000,
  maxFps: 30,
  // Simulcast relays: 720p mid @ 2.8 Mbps, 540p low @ 900 kbps.
  simulcast: true,
} as const;

export type LiveKitPublishLock = typeof LIVEKIT_PUBLISH_LOCK;

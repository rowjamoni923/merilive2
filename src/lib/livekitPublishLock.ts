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
  // Capture (CameraX) — portrait 9:16, 30 fps.
  captureWidth: 720,
  captureHeight: 1280,
  captureFps: 30,
  // Base layer encoder — 720p @ 30fps @ 2.5 Mbps. Pinned, never re-tuned.
  maxBitrate: 2_500_000,
  maxFps: 30,
  // Publish 3-layer simulcast so weak viewers get the 540p/360p relay
  // instead of pulling the host's base layer down.
  simulcast: true,
} as const;

export type LiveKitPublishLock = typeof LIVEKIT_PUBLISH_LOCK;

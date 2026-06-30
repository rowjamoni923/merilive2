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
  // Capture (CameraX) — full-sensor portrait 3:4, 30 fps, 1080p short-side.
  // Do NOT force 9:16 here: most front cameras are 4:3 and Android crops them
  // to satisfy 9:16, which is the zoomed-face bug reported in Live,
  // Party/Game Party and Private Call. Renderers then use object-contain/FIT.
  captureWidth: 1080,
  captureHeight: 1440,
  captureFps: 30,
  // Base layer encoder — 1080p @ 30fps @ 3.2 Mbps. Pinned, never re-tuned.
  maxBitrate: 3_200_000,
  maxFps: 30,
  // Simulcast relays: 720p mid, 540p low — SFU auto-picks per viewer.
  simulcast: true,
} as const;

export type LiveKitPublishLock = typeof LIVEKIT_PUBLISH_LOCK;

/// M6 — Publish quality LOCK (Flutter mirror of `src/lib/livekitPublishLock.ts`
/// and Kotlin `LiveKitFlutterPlugin.LOCK_*`).
///
/// Chamet / Bigo / Olamet parity — 1440×1920 @ 30 fps @ 6.5 Mbps base layer,
/// 3-layer simulcast, VP8. Neither the publisher SDK nor the SFU is allowed
/// to silently down-tune the base layer at runtime; adaptation happens on
/// the VIEWER side only via simulcast layer switching.
///
/// If a number changes here, change the matching value in
///   - src/lib/livekitPublishLock.ts        (web)
///   - android_native/LiveKitFlutterPlugin.kt  (LOCK_* constants)
/// IN THE SAME COMMIT and rebuild the APK. Mismatched values cause
/// sender/receiver drift and visible pumping.
class LiveKitPublishLock {
  const LiveKitPublishLock._();

  /// Natural 3:4 sensor frame (portrait). Higher sensor mode → sharper
  /// downscaled encode, no digital zoom (renderers keep portrait cover/fill).
  static const int captureWidth = 1440;
  static const int captureHeight = 1920;
  static const int captureFps = 30;

  /// Base layer encoder. Pinned, never re-tuned.
  static const int maxBitrate = 6500000;
  static const int maxFps = 30;

  /// 3 simulcast layers: 1440×1920 base, 720p mid @ 2.8 Mbps,
  /// 540p low @ 900 kbps.
  static const bool simulcast = true;

  /// VIEWER-side scale mode — must always be fill (SCALE_ASPECT_FILL) so
  /// portrait streams never letterbox on portrait viewers.
  static const String viewerScaleMode = 'fill';
}

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// A5 — Bridge from Flutter gift pipeline to the native Android
/// `NativeGiftAnimationPlugin` (Pkg438: VAP / SVGA / Lottie / MP4 / image
/// with priority queue + audio mixer).
///
/// The plugin lives in the Capacitor WebView host and exposes a
/// MethodChannel `merilive/gift_animation` when the host wires it (see
/// `android/app/src/main/kotlin/.../GiftAnimationChannel.kt`). On Web /
/// iOS / older APKs the channel isn't registered → every call becomes a
/// harmless no-op and the Dart `FullScreenGiftQueue` remains the visible
/// fallback (parity with `tryDispatchNativeGift*` in TS).
///
/// Contract mirrors `NativeGiftAnimation.ts` (Pkg438 Phase A):
/// ```json
/// {
///   "id": "gift_tx_uuid",
///   "kind": "svga" | "lottie" | "vap" | "mp4" | "image",
///   "url": "https://.../animation.svga",
///   "fallbackImage": "https://.../icon.png",
///   "durationMs": 3500,
///   "priority": 0,                 // higher = jump queue
///   "senderName": "Alice",
///   "receiverName": "Bob",
///   "giftName": "Dragon",
///   "quantity": 1,
///   "coinValue": 5000,
///   "surface": "live" | "party" | "call"
/// }
/// ```
class NativeGiftBridge {
  NativeGiftBridge._();
  static final NativeGiftBridge instance = NativeGiftBridge._();

  static const MethodChannel _channel =
      MethodChannel('merilive/gift_animation');

  bool _unavailable = false;

  /// Attempts to dispatch a gift to the native renderer. Returns `true`
  /// when native accepted the payload (Flutter overlay can skip),
  /// `false` when it should fall back to `FullScreenGiftQueue`.
  Future<bool> dispatch(Map<String, dynamic> payload) async {
    if (_unavailable || !_isMobile) return false;
    try {
      final res = await _channel.invokeMethod<bool>('play', payload);
      return res ?? false;
    } on MissingPluginException {
      _unavailable = true; // do not spam the channel this session
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Cancel any playing gift (host end / room leave).
  Future<void> stopAll() async {
    if (_unavailable || !_isMobile) return;
    try {
      await _channel.invokeMethod('stopAll');
    } catch (_) {}
  }

  bool get _isMobile =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;
}

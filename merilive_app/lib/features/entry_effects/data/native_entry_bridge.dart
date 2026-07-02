import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// A11 — Flutter bridge to the Android `NativeEntryAnimationPlugin`
/// (Pkg438: VAP / Lottie / image priority queue above the WebView).
///
/// Contract mirrors `src/plugins/NativeEntryAnimation.ts` (web/TS bridge).
/// MethodChannel: `merilive/entry_animation`.
/// Falls back to no-op on Web / iOS / older APKs — Flutter overlay
/// (`EntryNameBarOverlay`) takes over so every surface still animates.
class NativeEntryBridge {
  NativeEntryBridge._();
  static final NativeEntryBridge instance = NativeEntryBridge._();

  static const MethodChannel _channel = MethodChannel('merilive/entry_animation');

  bool _unavailable = false;

  bool get _isMobile =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  /// Enqueue a premium entrance / vehicle / name-bar animation on the
  /// native renderer. Returns `true` when native accepted the payload;
  /// caller should render the Flutter fallback banner when `false`.
  ///
  /// Payload keys (same as TS plugin):
  ///   id?, type: 'vap'|'lottie'|'image', url, soundUrl?,
  ///   priority (noble=400, vip=300, level=lvl, basic=0),
  ///   anchor: 'top'|'bottom', timeoutMs (default 10000)
  Future<bool> enqueue({
    String? id,
    required String url,
    String type = 'vap',
    String? soundUrl,
    int priority = 0,
    String anchor = 'top',
    int timeoutMs = 10000,
  }) async {
    if (_unavailable || !_isMobile) return false;
    if (url.trim().isEmpty) return false;
    try {
      final res = await _channel.invokeMethod<bool>('enqueue', {
        if (id != null) 'id': id,
        'type': type,
        'url': url,
        if (soundUrl != null) 'soundUrl': soundUrl,
        'priority': priority,
        'anchor': anchor,
        'timeoutMs': timeoutMs,
      });
      return res ?? false;
    } on MissingPluginException {
      _unavailable = true;
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> prefetch(String url) async {
    if (_unavailable || !_isMobile || url.isEmpty) return;
    try {
      await _channel.invokeMethod('prefetch', {'url': url});
    } catch (_) {}
  }

  Future<void> cancel(String id) async {
    if (_unavailable || !_isMobile) return;
    try {
      await _channel.invokeMethod('cancel', {'id': id});
    } catch (_) {}
  }

  Future<void> clearAll() async {
    if (_unavailable || !_isMobile) return;
    try {
      await _channel.invokeMethod('clearAll');
    } catch (_) {}
  }
}

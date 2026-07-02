import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// LiveKitBridge — Flutter ↔ Kotlin `LiveKitPlugin` MethodChannel.
///
/// Mirrors the Capacitor `LiveKitNative` plugin surface (initialize, connect,
/// attachLocal, setMirror, setScalingType, disconnect, getStatus,
/// startLocalPreview, stopLocalPreview) so Flutter screens can call the exact
/// same native code path as the web build — 1080p publish lock,
/// SCALE_ASPECT_FILL, hardware zoom clamp — with zero drift.
///
/// Contract locked to android/app/src/main/kotlin/com/merilive/app/plugins/
/// LiveKitFlutterPlugin.kt (see android_native/README.md in this app).
///
/// Every call is safe on:
///   * Web / iOS / desktop builds → returns a no-op result, never throws.
///   * Android without the plugin registered yet → returns `{attached:false,
///     reason:'unimplemented'}` so callers can degrade gracefully.
class LiveKitBridge {
  LiveKitBridge._();
  static final LiveKitBridge instance = LiveKitBridge._();

  static const MethodChannel _channel =
      MethodChannel('app.merilive/livekit');

  bool get _supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<Map<String, dynamic>> _invoke(
    String method, [
    Map<String, dynamic>? args,
  ]) async {
    if (!_supported) {
      return {'success': false, 'reason': 'unsupported_platform'};
    }
    try {
      final result = await _channel.invokeMapMethod<String, dynamic>(
        method,
        args ?? const {},
      );
      return result ?? const {'success': true};
    } on MissingPluginException {
      return {'success': false, 'reason': 'unimplemented'};
    } on PlatformException catch (e) {
      return {'success': false, 'reason': e.code, 'message': e.message};
    } catch (e) {
      return {'success': false, 'reason': 'exception', 'message': '$e'};
    }
  }

  // ── Surface / preview ───────────────────────────────────────────────

  /// Mount the SurfaceViewRenderer behind Flutter's transparent surface.
  Future<Map<String, dynamic>> initialize() => _invoke('initialize');

  /// Start a local camera preview WITHOUT connecting to any room.
  /// Locked to 1080p sensor, SCALE_ASPECT_FILL, min hardware zoom.
  Future<Map<String, dynamic>> startLocalPreview({bool front = true}) =>
      _invoke('startLocalPreview', {'front': front});

  Future<Map<String, dynamic>> stopLocalPreview() =>
      _invoke('stopLocalPreview');

  // ── Room lifecycle ──────────────────────────────────────────────────

  Future<Map<String, dynamic>> connect({
    required String wsUrl,
    required String token,
    bool publishVideo = false,
    bool publishAudio = false,
  }) =>
      _invoke('connect', {
        'wsUrl': wsUrl,
        'token': token,
        'publishVideo': publishVideo,
        'publishAudio': publishAudio,
      });

  Future<Map<String, dynamic>> disconnect() => _invoke('disconnect');
  Future<Map<String, dynamic>> getStatus() => _invoke('getStatus');

  // ── Local track control ─────────────────────────────────────────────

  Future<Map<String, dynamic>> attachLocal() => _invoke('attachLocal');
  Future<Map<String, dynamic>> detachLocal() => _invoke('detachLocal');

  // ── Renderer tweaks ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> setMirror(bool mirror) =>
      _invoke('setMirror', {'mirror': mirror});

  /// 'fit' (letterbox) or 'fill' (crop). Default enforced native-side = fill.
  Future<Map<String, dynamic>> setScalingType(String mode) =>
      _invoke('setScalingType', {'mode': mode});

  Future<Map<String, dynamic>> setVideoVisible(bool visible) =>
      _invoke('setVideoVisible', {'visible': visible});

  // ── C9 — call HUD controls (safe no-ops when native lacks the method) ─

  /// Mute/unmute the local audio publication.
  Future<Map<String, dynamic>> setMicEnabled(bool enabled) =>
      _invoke('setMicEnabled', {'enabled': enabled});

  /// Flip between front/back camera (also toggles mirror to match).
  Future<Map<String, dynamic>> switchCamera() => _invoke('switchCamera');

  /// Toggle GPUPixel beauty pipeline (smooth + white + slim).
  Future<Map<String, dynamic>> setBeautyEnabled(bool enabled) =>
      _invoke('setBeautyEnabled', {'enabled': enabled});

  // ── M5 — Call quality HUD (WebRTC getStats bridge) ─────────────────
  //
  // Returns {rttMs, upKbps, downKbps, lossPct, quality:'excellent'|'good'|
  // 'poor'|'lost'} when the native plugin implements it. Safe no-op
  // (`success:false, reason:'unimplemented'`) on older APKs / web / iOS.
  Future<Map<String, dynamic>> getStats() => _invoke('getStats');

  // ── M14 — Create-section prep controls ─────────────────────────────
  //
  // All safe no-ops on old APKs / web (see `_invoke`'s MissingPluginException
  // handling). Native side lands in LiveKitFlutterPlugin.kt.

  /// Per-slider beauty tuning (0.0–1.0). Native routes into the existing
  /// GPUPixel filter chain. When any value is non-zero the master switch is
  /// implicitly enabled; setBeautyEnabled(false) still overrides.
  Future<Map<String, dynamic>> setBeautyParams({
    double smooth = 0,
    double whiten = 0,
    double slim = 0,
    double eye = 0,
    double rosy = 0,
  }) =>
      _invoke('setBeautyParams', {
        'smooth': smooth,
        'whiten': whiten,
        'slim': slim,
        'eye': eye,
        'rosy': rosy,
      });

  /// Overlay a sticker on the composited camera frame. Pass null to clear.
  Future<Map<String, dynamic>> setStickerOverlay({
    String? stickerId,
    String? assetUrl,
    double x = 0.5,
    double y = 0.5,
    double scale = 1.0,
  }) =>
      _invoke('setStickerOverlay', {
        'stickerId': stickerId,
        'assetUrl': assetUrl,
        'x': x,
        'y': y,
        'scale': scale,
      });

  /// Snapshot the current local-preview frame as a base64 JPEG.
  Future<Map<String, dynamic>> snapshotLocalPreview() =>
      _invoke('snapshotLocalPreview');

  // ── Phase E — content safety ───────────────────────────────────────
  //
  // Both methods are safe no-ops on APKs where native side isn't wired
  // yet (returns `{success:false, reason:'unimplemented'}`). Callers
  // (LiveVoiceMonitor, AudioFocusAutoMute) treat that as "dormant".

  /// Capture a short audio chunk from the currently-published local mic
  /// track. Native side returns `{ok:true, base64:'…', mime:'audio/…'}`
  /// after `ms` ms; missing plugin returns unimplemented.
  Future<Map<String, dynamic>> snapshotVoiceChunk({int ms = 20000}) =>
      _invoke('snapshotVoiceChunk', {'ms': ms});

  // ── Phase G — background music / virtual bg / noise cancel ─────────
  //
  // All dormant-safe: `unimplemented` when native handler isn't shipped.
  // UI treats that as "queued for next APK" and still persists local
  // state so the toggle survives restarts.

  /// Play a remote music URL through the LiveKit audio mixer (ducked
  /// against the mic). Pass `url: null` (and `play: false`) to stop.
  Future<Map<String, dynamic>> setBackgroundMusic({
    String? url,
    bool play = true,
    double volume = 0.6,
  }) =>
      _invoke('setBackgroundMusic', {
        'url': url,
        'play': play,
        'volume': volume,
      });

  Future<Map<String, dynamic>> setBackgroundMusicPlaying(bool playing) =>
      _invoke('setBackgroundMusicPlaying', {'playing': playing});

  Future<Map<String, dynamic>> setBackgroundMusicVolume(double volume) =>
      _invoke('setBackgroundMusicVolume', {'volume': volume});

  /// Replace the camera background with a still image (URL) or clear
  /// with `url: null`. Native side runs GPUPixel segmentation.
  Future<Map<String, dynamic>> setVirtualBackground({String? url}) =>
      _invoke('setVirtualBackground', {'url': url});

  /// Toggle RNNoise / WebRTC-NS on the local audio track.
  Future<Map<String, dynamic>> setNoiseCancellation(bool enabled) =>
      _invoke('setNoiseCancellation', {'enabled': enabled});
}

/// Android AudioFocus event bridge — emits transient-loss / gain events
/// from the native AudioManager listener. No-op on other platforms; a
/// missing plugin registration simply yields an empty stream.
class AudioFocusEvents {
  AudioFocusEvents._();
  static final AudioFocusEvents instance = AudioFocusEvents._();

  static const EventChannel _channel =
      EventChannel('app.merilive/audio_focus');

  Stream<String>? _stream;

  /// Emits one of: 'gain', 'loss', 'loss_transient', 'loss_transient_can_duck'.
  Stream<String> events() {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const Stream<String>.empty();
    }
    _stream ??= _channel
        .receiveBroadcastStream()
        .map((e) => (e is Map ? e['change'] : e).toString())
        .handleError((_) {})
        .asBroadcastStream();
    return _stream!;
  }
}

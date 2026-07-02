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
}

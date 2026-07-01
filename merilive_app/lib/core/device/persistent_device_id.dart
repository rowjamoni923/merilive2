import 'dart:io' show Platform;
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persistent device ID — parity with web `getPersistentDeviceId()`.
///
/// Format is always `device_<hex-or-random>` so the same value is understood
/// by every backend RPC (`recover_session_by_device`, `claim_device_id`,
/// `device-session-recover`) shared with the React app.
///
/// - Android → ANDROID_ID (survives app uninstall on API 26+ per device+signing key)
/// - iOS     → identifierForVendor (survives reinstall while another vendor app remains)
/// - Web/desktop fallback → random 12-char hex, cached in secure storage
class PersistentDeviceId {
  PersistentDeviceId._();

  static const _storage = FlutterSecureStorage();
  static const _kMeriDeviceId = 'meri_device_id';
  static const _kPersistent = 'meri_persistent_device_id';

  static String? _cached;

  /// Returns the persistent device_id, generating (and caching) if missing.
  static Future<String> get() async {
    if (_cached != null) return _cached!;

    // 1. secure-storage cache (survives cold-start; matches web localStorage layer)
    final storedMeri = await _storage.read(key: _kMeriDeviceId);
    if (_isValid(storedMeri)) {
      _cached = storedMeri;
      return _cached!;
    }
    final storedPersistent = await _storage.read(key: _kPersistent);
    if (_isValid(storedPersistent)) {
      _cached = storedPersistent;
      await _storage.write(key: _kMeriDeviceId, value: _cached);
      return _cached!;
    }

    // 2. hardware ID
    try {
      final plugin = DeviceInfoPlugin();
      String? hardwareId;
      if (!kIsWeb) {
        if (Platform.isAndroid) {
          final info = await plugin.androidInfo;
          hardwareId = info.id; // ANDROID_ID
        } else if (Platform.isIOS) {
          final info = await plugin.iosInfo;
          hardwareId = info.identifierForVendor;
        }
      }
      if (hardwareId != null && hardwareId.isNotEmpty) {
        _cached = _format(hardwareId);
        await _persist(_cached!);
        return _cached!;
      }
    } catch (e) {
      // fall through to random
      debugPrint('[PersistentDeviceId] hardware lookup failed: $e');
    }

    // 3. random fallback (web preview / unsupported OS)
    final rand = Random.secure();
    final randomPart =
        List<int>.generate(12, (_) => rand.nextInt(36)).map((n) {
      return n < 10 ? n.toString() : String.fromCharCode(87 + n); // base36
    }).join();
    _cached = 'device_$randomPart';
    await _persist(_cached!);
    return _cached!;
  }

  static bool _isValid(String? v) => v != null && v.startsWith('device_') && v.length > 8;

  static String _format(String raw) {
    final clean = raw.replaceAll('-', '').toLowerCase();
    return 'device_$clean';
  }

  static Future<void> _persist(String id) async {
    await _storage.write(key: _kMeriDeviceId, value: id);
    await _storage.write(key: _kPersistent, value: id);
  }
}

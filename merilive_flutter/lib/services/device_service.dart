import 'package:flutter/material.dart';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class DeviceService {
  static final DeviceService _instance = DeviceService._internal();
  factory DeviceService() => _instance;
  DeviceService._internal();

  /// Gets a unique, persistent ID for this device.
  /// On Android, it uses the androidId. On iOS, it uses identifierForVendor.
  Future<String> getPersistentDeviceId() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    
    // Check if we've already cached it
    String? cachedId = prefs.getString('meri_device_id');
    if (cachedId != null) return cachedId;

    final DeviceInfoPlugin deviceInfo = DeviceInfoPlugin();
    String rawId = '';

    try {
      if (kIsWeb) {
        // For web, use a combination of browser info (fallback)
        rawId = 'web_${DateTime.now().millisecondsSinceEpoch}';
      } else if (Platform.isAndroid) {
        final AndroidDeviceInfo androidInfo = await deviceInfo.androidInfo;
        rawId = androidInfo.id; // Hardware ID
      } else if (Platform.isIOS) {
        final IosDeviceInfo iosInfo = await deviceInfo.iosInfo;
        rawId = iosInfo.identifierForVendor ?? 'ios_unknown';
      }
    } catch (e) {
      debugPrint('Error getting device info: $e');
      rawId = 'fallback_${DateTime.now().millisecondsSinceEpoch}';
    }

    // Hash it for privacy and consistency (matching web's MD5/SHA style)
    final String hashedId = sha256.convert(utf8.encode(rawId)).toString().substring(0, 32);
    
    await prefs.setString('meri_device_id', hashedId);
    return hashedId;
  }

  /// Detects the user's country using an IP-based service.
  /// Matches the web's 'detect-country' logic.
  Future<Map<String, String>> detectLocation() async {
    try {
      final response = await http.get(Uri.parse('https://ipapi.co/json/'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return {
          'country_code': data['country_code'] ?? 'US',
          'country_name': data['country_name'] ?? 'United States',
          'city': data['city'] ?? '',
          'region': data['region'] ?? '',
          'ip': data['ip'] ?? '',
        };
      }
    } catch (e) {
      debugPrint('Location detection error: $e');
    }
    return {'country_code': 'BD', 'country_name': 'Bangladesh'}; // Default fallback
  }
}



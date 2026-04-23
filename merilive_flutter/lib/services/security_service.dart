import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:screen_protector/screen_protector.dart';

class SecurityService with ChangeNotifier {
  static final SecurityService _instance = SecurityService._internal();
  factory SecurityService() => _instance;
  SecurityService._internal();

  final _supabase = Supabase.instance.client;
  bool _isVpnDetected = false;
  bool _isCheckingVpn = true;
  Map<String, dynamic>? _vpnDetails;

  bool get isVpnDetected => _isVpnDetected;
  bool get isCheckingVpn => _isCheckingVpn;
  Map<String, dynamic>? get vpnDetails => _vpnDetails;

  Future<void> checkVpn() async {
    _isCheckingVpn = true;
    notifyListeners();

    try {
      final res = await _supabase.functions.invoke('detect-vpn');
      final data = res.data as Map<String, dynamic>?;
      if (data != null) {
        _vpnDetails = data;
        _isVpnDetected = data['vpn'] == true || data['proxy'] == true || data['tor'] == true;
      }
    } catch (e) {
      debugPrint('[Security] VPN check error: $e');
    } finally {
      _isCheckingVpn = false;
      notifyListeners();
    }
  }

  void enableScreenProtection() async {
    if (!kIsWeb) {
      await ScreenProtector.preventScreenshotOn();
      await ScreenProtector.protectDataLeakageWithColor(0xFF000000);
    }
  }

  void disableScreenProtection() async {
    if (!kIsWeb) {
      await ScreenProtector.preventScreenshotOff();
    }
  }
}

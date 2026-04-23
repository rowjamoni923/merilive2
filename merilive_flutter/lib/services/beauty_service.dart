import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class BeautyService with ChangeNotifier {
  static final BeautyService _instance = BeautyService._internal();
  factory BeautyService() => _instance;
  BeautyService._internal();

  static const MethodChannel _channel = MethodChannel('com.merilive.app/deepar');

  bool _isInitialized = false;
  bool _isCameraRunning = false;
  bool _isFrontCamera = true;
  bool _beautyEnabled = true;
  Map<String, double> _beautySettings = {
    'smoothness': 0.35,
    'whitening': 0.20,
    'faceSlim': 0.15,
    'eyeEnlarge': 0.10,
  };

  bool get isInitialized => _isInitialized;
  bool get isCameraRunning => _isCameraRunning;
  bool get isFrontCamera => _isFrontCamera;
  bool get beautyEnabled => _beautyEnabled;
  Map<String, double> get beautySettings => _beautySettings;

  Future<void> initialize() async {
    try {
      final bool success = await _channel.invokeMethod('initialize');
      _isInitialized = success;
      notifyListeners();
    } catch (e) {
      debugPrint('[Beauty] Init error: $e');
    }
  }

  Future<void> startCamera() async {
    if (!_isInitialized) await initialize();
    try {
      await _channel.invokeMethod('startCamera');
      _isCameraRunning = true;
      notifyListeners();
      _syncBeauty();
    } catch (e) {
      debugPrint('[Beauty] StartCamera error: $e');
    }
  }

  Future<void> stopCamera() async {
    try {
      await _channel.invokeMethod('stopCamera');
      _isCameraRunning = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Beauty] StopCamera error: $e');
    }
  }

  Future<void> switchCamera() async {
    try {
      final bool isFront = await _channel.invokeMethod('switchCamera');
      _isFrontCamera = isFront;
      notifyListeners();
    } catch (e) {
      debugPrint('[Beauty] SwitchCamera error: $e');
    }
  }

  Future<void> setBeautyParam(String param, double value) async {
    _beautySettings[param] = value;
    if (_beautyEnabled) {
      _syncParam(param, value);
    }
    notifyListeners();
  }

  Future<void> setBeautyEnabled(bool enabled) async {
    _beautyEnabled = enabled;
    if (enabled) {
      _syncBeauty();
    } else {
      await _channel.invokeMethod('clearBeauty');
    }
    notifyListeners();
  }

  Future<void> _syncBeauty() async {
    _beautySettings.forEach((key, value) {
      _syncParam(key, value);
    });
  }

  Future<void> _syncParam(String param, double value) async {
    try {
      await _channel.invokeMethod('setBeautyParam', {'param': param, 'value': value});
    } catch (e) {
      debugPrint('[Beauty] SyncParam error: $e');
    }
  }

  Future<void> applySticker(String effectPath) async {
    try {
      await _channel.invokeMethod('applySticker', {'path': effectPath});
    } catch (e) {
      debugPrint('[Beauty] ApplySticker error: $e');
    }
  }
}

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

class PermissionService with ChangeNotifier {
  static final PermissionService _instance = PermissionService._internal();
  factory PermissionService() => _instance;
  PermissionService._internal();

  bool _cameraGranted = false;
  bool _microphoneGranted = false;
  bool _isRequesting = false;

  bool get cameraGranted => _cameraGranted;
  bool get microphoneGranted => _microphoneGranted;
  bool get isRequesting => _isRequesting;

  Future<void> checkPermissions() async {
    _cameraGranted = await Permission.camera.isGranted;
    _microphoneGranted = await Permission.microphone.isGranted;
    notifyListeners();
  }

  Future<bool> requestCameraPermission() async {
    _isRequesting = true;
    notifyListeners();

    final status = await Permission.camera.request();
    _cameraGranted = status.isGranted;
    
    _isRequesting = false;
    notifyListeners();
    return _cameraGranted;
  }

  Future<bool> requestMicrophonePermission() async {
    _isRequesting = true;
    notifyListeners();

    final status = await Permission.microphone.request();
    _microphoneGranted = status.isGranted;
    
    _isRequesting = false;
    notifyListeners();
    return _microphoneGranted;
  }

  Future<bool> requestAllMediaPermissions() async {
    _isRequesting = true;
    notifyListeners();

    Map<Permission, PermissionStatus> statuses = await [
      Permission.camera,
      Permission.microphone,
    ].request();

    _cameraGranted = statuses[Permission.camera]!.isGranted;
    _microphoneGranted = statuses[Permission.microphone]!.isGranted;

    _isRequesting = false;
    notifyListeners();
    return _cameraGranted && _microphoneGranted;
  }

  Future<void> openAppSettings() async {
    await openAppSettings();
  }
}

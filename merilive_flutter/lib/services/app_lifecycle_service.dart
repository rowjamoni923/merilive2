import 'dart:async';
import 'package:flutter/material.dart';

class AppLifecycleService with WidgetsBindingObserver {
  static final AppLifecycleService _instance = AppLifecycleService._internal();
  factory AppLifecycleService() => _instance;
  AppLifecycleService._internal();

  final StreamController<void> _resumeController = StreamController<void>.broadcast();
  Stream<void> get onResume => _resumeController.stream;

  DateTime? _lastHiddenAt;

  void init() {
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.hidden || state == AppLifecycleState.paused) {
      _lastHiddenAt = DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      _handleResume();
    }
  }

  Future<void> _handleResume() async {
    final now = DateTime.now();
    final hiddenFor = _lastHiddenAt != null ? now.difference(_lastHiddenAt!) : Duration.zero;

    // Only treat as resume if app was hidden for at least 8 seconds
    if (hiddenFor.inSeconds < 8) return;

    debugPrint('[Lifecycle] App resumed after ${hiddenFor.inSeconds}s — zero-refresh policy active');
    // No session refresh, resume broadcasts, realtime nudges, or presence
    // re-init on foreground. Supabase/LiveKit sockets own reconnection, and
    // screen data updates only through realtime or explicit user actions.
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _resumeController.close();
  }
}

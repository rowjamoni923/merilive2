import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';
import 'presence_service.dart';

class AppLifecycleService with WidgetsBindingObserver {
  static final AppLifecycleService _instance = AppLifecycleService._internal();
  factory AppLifecycleService() => _instance;
  AppLifecycleService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();
  final _presence = PresenceService();
  
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

    debugPrint('[Lifecycle] 🔄 App resumed after ${hiddenFor.inSeconds}s');

    // 1. Reconnect realtime if needed
    if (!_realtime.isConnected) {
      // Supabase SDK handles reconnection automatically, but we can nudge it
    }

    // 2. Refresh session
    try {
      final session = _supabase.auth.currentSession;
      if (session != null && session.isExpired) {
        await _supabase.auth.refreshSession();
        debugPrint('[Lifecycle] ✅ Session refreshed');
      }
    } catch (e) {
      debugPrint('[Lifecycle] Session refresh error: $e');
    }

    // 3. Trigger resume listeners
    _resumeController.add(null);

    // 4. Update presence status to online
    final userId = _supabase.auth.currentUser?.id;
    if (userId != null) {
      _presence.init(userId);
    }
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _resumeController.close();
  }
}

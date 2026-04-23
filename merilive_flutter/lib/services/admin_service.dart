import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class AdminService with ChangeNotifier {
  static final AdminService _instance = AdminService._internal();
  factory AdminService() => _instance;
  AdminService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _logs = [];
  bool _loading = true;

  Map<String, dynamic> get stats => _stats;
  List<Map<String, dynamic>> get logs => _logs;
  bool get loading => _loading;

  void init(String userId) {
    _fetchStats();
    _fetchLogs();

    // Admin-critical tables from GLOBALLY_MONITORED_TABLES
    _realtime.subscribe(
      subscriberId: 'admin-service-$userId',
      tables: ['agencies', 'topup_helpers', 'admin_logs', 'notifications'],
      callback: (table, event, payload) {
        _fetchStats();
        if (table == 'admin_logs') {
          _fetchLogs();
        }
      },
    );
  }

  Future<void> _fetchStats() async {
    try {
      final res = await _supabase.rpc('get_admin_dashboard_stats');
      _stats = Map<String, dynamic>.from(res);
      notifyListeners();
    } catch (e) {
      debugPrint('[Admin] Stats error: $e');
    }
  }

  Future<void> _fetchLogs() async {
    try {
      final res = await _supabase.from('admin_logs').select().order('created_at', ascending: false).limit(50);
      _logs = List<Map<String, dynamic>>.from(res);
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Admin] Logs error: $e');
    }
  }

  void disposeAdmin(String userId) {
    _realtime.unsubscribe('admin-service-$userId');
    _stats = {};
    _logs = [];
    _loading = true;
  }
}

import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

typedef RealtimeCallback = void Function(String table, String event, Map<String, dynamic> payload);

class SupabaseRealtimeService {
  static final SupabaseRealtimeService _instance = SupabaseRealtimeService._internal();
  factory SupabaseRealtimeService() => _instance;
  SupabaseRealtimeService._internal();

  final _supabase = Supabase.instance.client;
  final Map<String, List<_Subscriber>> _subscribers = {};
  RealtimeChannel? _universalChannel;
  bool _isConnected = false;
  Timer? _rebuildTimer;

  bool get isConnected => _isConnected;

  void subscribe({
    required String subscriberId,
    required List<String> tables,
    required RealtimeCallback callback,
  }) {
    final subscriber = _Subscriber(subscriberId, tables, callback);
    
    for (final table in tables) {
      _subscribers.putIfAbsent(table, () => []).add(subscriber);
    }

    _scheduleRebuild();
  }

  void unsubscribe(String subscriberId) {
    _subscribers.forEach((table, list) {
      list.removeWhere((s) => s.id == subscriberId);
    });
    
    _subscribers.removeWhere((table, list) => list.isEmpty);
    _scheduleRebuild();
  }

  void _scheduleRebuild() {
    _rebuildTimer?.cancel();
    _rebuildTimer = Timer(const Duration(milliseconds: 500), _rebuildChannel);
  }

  Future<void> _rebuildChannel() async {
    if (_universalChannel != null) {
      await _supabase.removeChannel(_universalChannel!);
      _universalChannel = null;
    }

    if (_subscribers.isEmpty) {
      _isConnected = false;
      return;
    }

    final channel = _supabase.channel('universal-realtime-v3');
    
    final uniqueTables = _subscribers.keys.toList();
    for (final table in uniqueTables) {
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        callback: (payload) {
          final eventType = payload.eventType.name.toUpperCase();
          final data = eventType == 'DELETE' ? payload.oldRecord : payload.newRecord;
          _notifySubscribers(table, eventType, data);
        },
      );
    }

    channel.subscribe((status, [error]) {
      if (status == RealtimeSubscribeStatus.subscribed) {
        _isConnected = true;
        debugPrint('[Realtime] ✅ Connected to universal channel');
      } else {
        _isConnected = false;
        debugPrint('[Realtime] ⚠️ Channel status: $status');
      }
    });

    _universalChannel = channel;
  }

  void _notifySubscribers(String table, String event, Map<String, dynamic> data) {
    final list = _subscribers[table];
    if (list != null) {
      for (final subscriber in list) {
        try {
          subscriber.callback(table, event, data);
        } catch (e) {
          debugPrint('[Realtime] Error in subscriber ${subscriber.id}: $e');
        }
      }
    }
  }
}

class _Subscriber {
  final String id;
  final List<String> tables;
  final RealtimeCallback callback;

  _Subscriber(this.id, this.tables, this.callback);
}

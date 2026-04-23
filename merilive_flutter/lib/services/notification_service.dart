import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';
import 'sound_service.dart';

class NotificationService with ChangeNotifier {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();
  final _sound = SoundService();

  List<Map<String, dynamic>> _notifications = [];
  int _unreadCount = 0;
  bool _loading = true;

  List<Map<String, dynamic>> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get loading => _loading;

  void init(String userId) {
    _fetchNotifications(userId);

    _realtime.subscribe(
      subscriberId: 'notification-service-$userId',
      tables: ['notifications', 'helper_notifications'],
      callback: (table, event, payload) {
        if (event == 'INSERT') {
          if (table == 'notifications' && payload['user_id'] == userId) {
            _handleNewNotification(payload);
          } else if (table == 'helper_notifications') {
             // Logic for helper notifications
             _fetchNotifications(userId);
          }
        } else if (event == 'UPDATE') {
          _fetchNotifications(userId);
        }
      },
    );
  }

  Future<void> _fetchNotifications(String userId) async {
    try {
      final res = await _supabase
          .from('notifications')
          .select()
          .eq('user_id', userId)
          .eq('is_read', false)
          .order('created_at', ascending: false)
          .limit(50);
      
      _notifications = List<Map<String, dynamic>>.from(res);
      _unreadCount = _notifications.length;
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Notifications] Error: $e');
    }
  }

  void _handleNewNotification(Map<String, dynamic> payload) {
    _notifications.insert(0, payload);
    _unreadCount++;
    
    // Play sound based on type
    final type = payload['type'] ?? '';
    if (type.contains('gift')) {
      _sound.playGift();
    } else if (type.contains('coin')) {
      _sound.playCoin();
    } else {
      _sound.playNotification();
    }
    
    notifyListeners();
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _supabase.from('notifications').update({'is_read': true}).eq('id', notificationId);
      _notifications.removeWhere((n) => n['id'] == notificationId);
      _unreadCount = _notifications.length;
      notifyListeners();
    } catch (e) {
      debugPrint('[Notifications] MarkRead error: $e');
    }
  }

  Future<void> markAllAsRead(String userId) async {
    try {
      await _supabase.from('notifications').update({'is_read': true}).eq('user_id', userId).eq('is_read', false);
      _notifications.clear();
      _unreadCount = 0;
      notifyListeners();
    } catch (e) {
      debugPrint('[Notifications] MarkAllRead error: $e');
    }
  }

  void disposeNotifications(String userId) {
    _realtime.unsubscribe('notification-service-$userId');
    _notifications = [];
    _unreadCount = 0;
    _loading = true;
  }
}

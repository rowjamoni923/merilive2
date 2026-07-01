import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

class PresenceService with ChangeNotifier {
  static final PresenceService _instance = PresenceService._internal();
  factory PresenceService() => _instance;
  PresenceService._internal();

  final _supabase = Supabase.instance.client;
  RealtimeChannel? _presenceChannel;
  final Set<String> _onlineUsers = {};

  Set<String> get onlineUsers => _onlineUsers;

  void init(String userId) {
    if (_presenceChannel != null) return;

    _presenceChannel = _supabase.channel('online-users-global', opts: const RealtimeChannelConfig(presence: RealtimePresenceConfig(key: 'global')));
    
    _presenceChannel?.onPresenceSync((_) {
      final state = _presenceChannel!.presenceState();
      _onlineUsers.clear();
      for (final key in state.keys) {
        _onlineUsers.add(key);
      }
      notifyListeners();
    }).onPresenceJoin((payload) {
      _onlineUsers.add(payload.key);
      notifyListeners();
    }).onPresenceLeave((payload) {
      _onlineUsers.remove(payload.key);
      notifyListeners();
    }).subscribe((status, [error]) async {
      if (status == RealtimeSubscribeStatus.subscribed) {
        await _presenceChannel?.track({'id': userId, 'online_at': DateTime.now().toIso8601String()});
        _updateDbStatus(userId, true);
      }
    });
  }

  void _updateDbStatus(String userId, bool isOnline) async {
    try {
      await _supabase.from('profiles').update({
        'is_online': isOnline,
        'last_seen_at': DateTime.now().toIso8601String(),
      }).eq('id', userId);
    } catch (e) {
      debugPrint('[Presence] DB update error: $e');
    }
  }

  bool isUserOnline(String userId) => _onlineUsers.contains(userId);

  void disposePresence(String userId) {
    _updateDbStatus(userId, false);
    if (_presenceChannel != null) {
      _supabase.removeChannel(_presenceChannel!);
      _presenceChannel = null;
    }
    _onlineUsers.clear();
  }
}

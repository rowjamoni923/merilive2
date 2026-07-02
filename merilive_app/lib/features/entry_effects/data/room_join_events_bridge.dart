import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A11 — Realtime source of "user just joined this room" events.
/// Powers the entry-animation dispatcher on live streams and party rooms.
///
/// Live surface  → subscribes to `stream_viewers` INSERT (stream_id filter)
/// Party surface → subscribes to `party_participants` INSERT (room_id filter)
///
/// Enrichment: joins to `profiles_public` for display_name, avatar_url,
/// user_level (falls back to `profiles` if the public view is missing
/// a row for a fresh account).
class RoomJoinEvent {
  const RoomJoinEvent({
    required this.userId,
    required this.displayName,
    required this.userLevel,
    this.avatarUrl,
  });

  final String userId;
  final String displayName;
  final int userLevel;
  final String? avatarUrl;
}

enum RoomJoinSurface { live, party }

class RoomJoinEventsBridge {
  RoomJoinEventsBridge._();
  static final RoomJoinEventsBridge instance = RoomJoinEventsBridge._();

  final _client = Supabase.instance.client;

  RealtimeChannel? _channel;
  final _controller = StreamController<RoomJoinEvent>.broadcast();
  String? _currentRoomId;
  RoomJoinSurface? _currentSurface;
  final Set<String> _seenUserIds = {};

  Stream<RoomJoinEvent> get events$ => _controller.stream;

  Future<void> attach({
    required RoomJoinSurface surface,
    required String roomId,
  }) async {
    if (_currentRoomId == roomId && _currentSurface == surface) return;
    await detach();

    _currentRoomId = roomId;
    _currentSurface = surface;
    _seenUserIds.clear();

    final table =
        surface == RoomJoinSurface.live ? 'stream_viewers' : 'party_participants';
    final column = surface == RoomJoinSurface.live ? 'stream_id' : 'room_id';
    final userCol = surface == RoomJoinSurface.live ? 'viewer_id' : 'user_id';

    _channel = _client
        .channel('flutter_join_${surface.name}_$roomId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: table,
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: column,
            value: roomId,
          ),
          callback: (payload) => _onInsert(payload.newRecord, userCol),
        )
        .subscribe();
  }

  Future<void> detach() async {
    _currentRoomId = null;
    _currentSurface = null;
    _seenUserIds.clear();
    final c = _channel;
    _channel = null;
    if (c != null) {
      try {
        await _client.removeChannel(c);
      } catch (_) {}
    }
  }

  Future<void> _onInsert(Map<String, dynamic> row, String userCol) async {
    final uid = row[userCol]?.toString();
    if (uid == null || uid.isEmpty) return;
    // De-dup: a viewer can re-join in the same session (network blip);
    // only trigger the entry animation once per attach() lifetime.
    if (_seenUserIds.contains(uid)) return;
    _seenUserIds.add(uid);

    try {
      Map<String, dynamic>? profile;
      try {
        profile = await _client
            .from('profiles_public')
            .select('id, display_name, avatar_url, user_level')
            .eq('id', uid)
            .maybeSingle();
      } catch (_) {}
      profile ??= await _client
          .from('profiles')
          .select('id, name, avatar_url, user_level')
          .eq('id', uid)
          .maybeSingle();

      _controller.add(RoomJoinEvent(
        userId: uid,
        displayName: (profile?['display_name'] ?? profile?['name'] ?? 'Guest')
            .toString(),
        userLevel: (profile?['user_level'] as num?)?.toInt() ?? 1,
        avatarUrl: profile?['avatar_url']?.toString(),
      ));
    } catch (_) {}
  }
}

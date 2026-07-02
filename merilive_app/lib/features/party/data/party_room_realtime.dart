import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Realtime tap for a single party room — subscribes to participants, seat
/// locks, and message inserts. Callers drive the cubit via the callbacks.
class PartyRoomRealtime {
  PartyRoomRealtime(this._supabase);
  final SupabaseClient _supabase;

  RealtimeChannel? _channel;

  void subscribe({
    required String roomId,
    required VoidCallback onParticipantsChanged,
    required VoidCallback onSeatLocksChanged,
    required ValueChanged<Map<String, dynamic>> onMessageInsert,
    required VoidCallback onRoomChanged,
    VoidCallback? onSeatRequestsChanged,
  }) {
    unsubscribe();
    final ch = _supabase.channel('party_room:$roomId')
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'party_room_participants',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'room_id',
          value: roomId,
        ),
        callback: (_) => onParticipantsChanged(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'party_room_seat_locks',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'room_id',
          value: roomId,
        ),
        callback: (_) => onSeatLocksChanged(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'party_room_messages',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'room_id',
          value: roomId,
        ),
        callback: (p) {
          final rec = p.newRecord;
          if (rec.isNotEmpty) onMessageInsert(rec);
        },
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.update,
        schema: 'public',
        table: 'party_rooms',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'id',
          value: roomId,
        ),
        callback: (_) => onRoomChanged(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'seat_requests',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'room_id',
          value: roomId,
        ),
        callback: (_) => onSeatRequestsChanged?.call(),
      )
      ..subscribe();
    _channel = ch;
  }


  Future<void> unsubscribe() async {
    final c = _channel;
    _channel = null;
    if (c != null) await _supabase.removeChannel(c);
  }
}

typedef VoidCallback = void Function();
typedef ValueChanged<T> = void Function(T value);

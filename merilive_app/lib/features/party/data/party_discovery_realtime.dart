import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Party discovery realtime — mirrors web `subscribeToTables(['party_rooms',
/// 'party_room_participants'])` + a direct `postgres_changes` UPDATE listener
/// on `party_rooms` for instant-close when a host ends the room.
class PartyDiscoveryRealtime {
  PartyDiscoveryRealtime(this._supabase);

  final SupabaseClient _supabase;
  final _controller = StreamController<PartyRealtimeEvent>.broadcast();
  RealtimeChannel? _channel;

  Stream<PartyRealtimeEvent> get stream => _controller.stream;

  void start() {
    if (_channel != null) return;
    _channel = _supabase
        .channel('party-discovery')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'party_rooms',
          callback: (payload) {
            final newRow = payload.newRecord;
            final oldRow = payload.oldRecord;
            // Instant-close: is_active flipped false.
            if (payload.eventType == PostgresChangeEvent.update &&
                newRow['is_active'] == false) {
              _emit(PartyRealtimeEvent.roomClosed(newRow['id']?.toString()));
              return;
            }
            if (payload.eventType == PostgresChangeEvent.delete) {
              _emit(PartyRealtimeEvent.roomClosed(oldRow['id']?.toString()));
              return;
            }
            _emit(const PartyRealtimeEvent.dirty());
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'party_room_participants',
          callback: (_) => _emit(const PartyRealtimeEvent.dirty()),
        )
        .subscribe();
  }

  void _emit(PartyRealtimeEvent e) {
    if (!_controller.isClosed) _controller.add(e);
  }

  Future<void> dispose() async {
    final ch = _channel;
    _channel = null;
    if (ch != null) await _supabase.removeChannel(ch);
    await _controller.close();
  }
}

class PartyRealtimeEvent {
  const PartyRealtimeEvent._(this.kind, this.roomId);
  const PartyRealtimeEvent.dirty() : this._(PartyRealtimeEventKind.dirty, null);
  const PartyRealtimeEvent.roomClosed(String? id)
      : this._(PartyRealtimeEventKind.closed, id);

  final PartyRealtimeEventKind kind;
  final String? roomId;
}

enum PartyRealtimeEventKind { dirty, closed }

import 'package:supabase_flutter/supabase_flutter.dart';

import 'party_models.dart';

/// Party discovery data — 1:1 with web `src/pages/Discover.tsx`.
///
///   • `party_rooms` where `is_active = true`
///   • live participant count from `party_room_participants` (`left_at IS NULL`)
///   • host stitched from `profiles_public`
///
/// Web goes through per-host level tier resolution; the same input
/// (`user_level` / `host_level`) is exposed on `PartyHost` so the card can
/// pick the same tier shadow without a separate RPC round-trip.
class PartyDiscoveryRepository {
  PartyDiscoveryRepository(this._supabase);

  final SupabaseClient _supabase;

  Future<List<PartyRoom>> fetchRooms() async {
    final results = await Future.wait([
      _supabase
          .from('party_room_participants')
          .select('room_id, user_id, role, joined_at, left_at')
          .isFilter('left_at', null),
      _supabase
          .from('party_rooms')
          .select()
          .eq('is_active', true),
    ]);

    final participants = (results[0] as List).cast<Map>();
    final rooms = (results[1] as List).cast<Map>();

    if (rooms.isEmpty) return const [];

    // Participant count per room.
    final counts = <String, int>{};
    for (final p in participants) {
      final rid = p['room_id']?.toString();
      if (rid == null) continue;
      counts[rid] = (counts[rid] ?? 0) + 1;
    }

    // Host stitch via profiles_public.
    final hostIds = <String>{};
    for (final r in rooms) {
      final hid = r['host_id']?.toString();
      if (hid != null && hid.isNotEmpty) hostIds.add(hid);
    }

    final hostMap = <String, PartyHost>{};
    if (hostIds.isNotEmpty) {
      final hosts = await _supabase
          .from('profiles_public')
          .select(
            'id, display_name, avatar_url, user_level, host_level, '
            'country_flag, country_code, is_online, is_host, gender',
          )
          .inFilter('id', hostIds.toList());
      for (final h in (hosts as List).cast<Map>()) {
        final host = PartyHost.fromRow(Map<String, dynamic>.from(h));
        hostMap[host.id] = host;
      }
    }

    return rooms.map((r) {
      final row = Map<String, dynamic>.from(r);
      final hostId = row['host_id']?.toString();
      final host = hostId != null ? hostMap[hostId] : null;
      final base = PartyRoom.fromRow(row, host: host);
      // Web parity: Math.max(participants_count, active_seats, 1).
      final activeSeats = (row['active_seats'] as num?)?.toInt() ?? 0;
      final count = counts[base.id] ?? 0;
      final live = [count, activeSeats, 1]
          .reduce((a, b) => a > b ? a : b);
      return base.copyWith(currentParticipants: live);
    }).toList(growable: false);
  }

  /// Room-code quick-join — matches `Discover.tsx` `handleRoomCodeJoin`.
  Future<PartyRoom?> findByCode(String rawCode) async {
    final code = rawCode.trim().toUpperCase();
    if (code.isEmpty) return null;

    final row = await _supabase
        .from('party_rooms')
        .select()
        .eq('room_code', code)
        .eq('is_active', true)
        .maybeSingle();
    if (row == null) return null;

    final data = Map<String, dynamic>.from(row);
    PartyHost? host;
    final hid = data['host_id']?.toString();
    if (hid != null && hid.isNotEmpty) {
      final h = await _supabase
          .from('profiles_public')
          .select(
            'id, display_name, avatar_url, user_level, host_level, '
            'country_flag, country_code, is_online, is_host, gender',
          )
          .eq('id', hid)
          .maybeSingle();
      if (h != null) host = PartyHost.fromRow(Map<String, dynamic>.from(h));
    }
    return PartyRoom.fromRow(data, host: host);
  }
}

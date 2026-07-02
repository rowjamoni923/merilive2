import 'package:supabase_flutter/supabase_flutter.dart';

import 'party_models.dart';
import 'party_room_models.dart';

/// Party room data — mirrors web `UnifiedPartyRoom.tsx` server calls.
///
/// Tables:
///   • party_rooms                (room meta)
///   • party_room_participants    (seat occupancy, role, mute state)
///   • party_room_seat_locks      (per-seat host restrictions)
///   • party_room_messages        (chat + system events)
class PartyRoomRepository {
  PartyRoomRepository(this._supabase);
  final SupabaseClient _supabase;

  Future<({PartyRoom room, PartyHost? host})> loadRoom(String roomId) async {
    final row = await _supabase
        .from('party_rooms')
        .select()
        .eq('id', roomId)
        .maybeSingle();
    if (row == null) {
      throw StateError('Room not found');
    }
    PartyHost? host;
    final hostId = row['host_id']?.toString();
    if (hostId != null && hostId.isNotEmpty) {
      final h = await _supabase
          .from('profiles_public')
          .select(
            'id, display_name, avatar_url, user_level, host_level, '
            'country_flag, country_code, is_online, is_host, gender',
          )
          .eq('id', hostId)
          .maybeSingle();
      if (h != null) host = PartyHost.fromRow(h.cast<String, dynamic>());
    }
    return (
      room: PartyRoom.fromRow(row.cast<String, dynamic>(), host: host),
      host: host,
    );
  }

  Future<List<PartySeat>> loadSeats(String roomId, int totalSeats) async {
    final results = await Future.wait([
      _supabase
          .from('party_room_participants')
          .select(
            'id, user_id, role, seat_number, is_muted, muted_by_host, joined_at',
          )
          .eq('room_id', roomId)
          .isFilter('left_at', null),
      _supabase
          .from('party_room_seat_locks')
          .select('seat_number, is_locked, forbid_audio, forbid_video')
          .eq('room_id', roomId),
    ]);

    final participants = (results[0] as List).cast<Map>();
    final locks = (results[1] as List).cast<Map>();

    // Profile hydration.
    final userIds = <String>{
      for (final p in participants)
        if (p['user_id'] != null) p['user_id'].toString(),
    };
    final profileMap = <String, Map<String, dynamic>>{};
    if (userIds.isNotEmpty) {
      final rows = await _supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level, gender')
          .inFilter('id', userIds.toList());
      for (final r in (rows as List).cast<Map>()) {
        profileMap[r['id'].toString()] = r.cast<String, dynamic>();
      }
    }

    // Index participants by seat.
    final bySeat = <int, Map>{};
    for (final p in participants) {
      final seat = (p['seat_number'] as num?)?.toInt();
      if (seat != null && seat > 0) bySeat[seat] = p;
    }
    final lockBySeat = <int, Map>{
      for (final l in locks)
        if (l['seat_number'] != null) (l['seat_number'] as num).toInt(): l,
    };

    final total = totalSeats > 0 ? totalSeats : 8;
    return List.generate(total, (i) {
      final n = i + 1;
      final p = bySeat[n];
      final l = lockBySeat[n];
      if (p == null) {
        return PartySeat.empty(n).copyWith(
          isLocked: (l?['is_locked'] as bool?) ?? false,
          forbidAudio: (l?['forbid_audio'] as bool?) ?? false,
          forbidVideo: (l?['forbid_video'] as bool?) ?? false,
        );
      }
      final uid = p['user_id']?.toString();
      final prof = uid != null ? profileMap[uid] : null;
      return PartySeat(
        seatNumber: n,
        participantId: p['id']?.toString(),
        userId: uid,
        role: (p['role'] as String?) ?? 'member',
        isMuted: p['is_muted'] == true,
        mutedByHost: p['muted_by_host'] == true,
        displayName: prof?['display_name'] as String?,
        avatarUrl: prof?['avatar_url'] as String?,
        userLevel: (prof?['user_level'] as num?)?.toInt() ?? 0,
        gender: prof?['gender'] as String?,
        isLocked: (l?['is_locked'] as bool?) ?? false,
        forbidAudio: (l?['forbid_audio'] as bool?) ?? false,
        forbidVideo: (l?['forbid_video'] as bool?) ?? false,
      );
    });
  }

  Future<List<PartyChatMessage>> loadRecentMessages(String roomId,
      {int limit = 50}) async {
    final rows = await _supabase
        .from('party_room_messages')
        .select('id, user_id, content, message_type, created_at, gift_data')
        .eq('room_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', ascending: false)
        .limit(limit);
    final list = (rows as List).cast<Map>();
    final userIds = <String>{
      for (final m in list)
        if (m['user_id'] != null) m['user_id'].toString(),
    };
    final profiles = <String, Map<String, dynamic>>{};
    if (userIds.isNotEmpty) {
      final ps = await _supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level')
          .inFilter('id', userIds.toList());
      for (final r in (ps as List).cast<Map>()) {
        profiles[r['id'].toString()] = r.cast<String, dynamic>();
      }
    }
    final msgs = list.reversed.map((m) {
      final uid = m['user_id']?.toString();
      final p = uid != null ? profiles[uid] : null;
      return PartyChatMessage.fromRow(
        m.cast<String, dynamic>(),
        displayName: p?['display_name'] as String?,
        avatarUrl: p?['avatar_url'] as String?,
        userLevel: (p?['user_level'] as num?)?.toInt() ?? 0,
      );
    }).toList();
    return msgs;
  }

  /// Join as viewer (no seat).
  Future<String?> joinAsViewer(String roomId, String userId) async {
    final existing = await _supabase
        .from('party_room_participants')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .isFilter('left_at', null)
        .maybeSingle();
    if (existing != null) return existing['id']?.toString();

    final row = await _supabase
        .from('party_room_participants')
        .insert({
          'room_id': roomId,
          'user_id': userId,
          'role': 'viewer',
          'seat_number': null,
        })
        .select('id')
        .single();
    return row['id']?.toString();
  }

  /// Take an empty seat.
  Future<void> takeSeat({
    required String roomId,
    required String userId,
    required int seatNumber,
  }) async {
    await _supabase
        .from('party_room_participants')
        .update({'seat_number': seatNumber, 'role': 'member'})
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .isFilter('left_at', null);
  }

  Future<void> leaveSeat({
    required String roomId,
    required String userId,
  }) async {
    await _supabase
        .from('party_room_participants')
        .update({'seat_number': null, 'role': 'viewer', 'is_muted': true})
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .isFilter('left_at', null);
  }

  Future<void> toggleSelfMute({
    required String roomId,
    required String userId,
    required bool muted,
  }) async {
    await _supabase
        .from('party_room_participants')
        .update({'is_muted': muted})
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .isFilter('left_at', null);
  }

  Future<void> leaveRoom({
    required String roomId,
    required String userId,
  }) async {
    await _supabase
        .from('party_room_participants')
        .update({'left_at': DateTime.now().toIso8601String()})
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .isFilter('left_at', null);
  }

  Future<void> sendMessage({
    required String roomId,
    required String userId,
    required String content,
  }) async {
    await _supabase.from('party_room_messages').insert({
      'room_id': roomId,
      'user_id': userId,
      'content': content,
      'message_type': 'text',
    });
  }

  /// Host-only: force mute a participant.
  Future<void> hostMuteParticipant({
    required String participantId,
    required bool muted,
  }) async {
    await _supabase
        .from('party_room_participants')
        .update({'muted_by_host': muted, 'is_muted': muted})
        .eq('id', participantId);
  }

  /// Host-only: kick a participant.
  Future<void> hostKick({required String participantId}) async {
    await _supabase
        .from('party_room_participants')
        .update({'left_at': DateTime.now().toIso8601String()})
        .eq('id', participantId);
  }

  // ─────────────────────────────────────────────────────────────
  // PD6 — Seat request flow (viewer → host approval)
  // ─────────────────────────────────────────────────────────────

  /// Viewer asks the host for a specific seat. Idempotent: reuses any
  /// existing `pending` row instead of stacking duplicates.
  Future<void> requestSeat({
    required String roomId,
    required String userId,
    required int seatNumber,
  }) async {
    final existing = await _supabase
        .from('seat_requests')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();
    if (existing != null) return;
    await _supabase.from('seat_requests').insert({
      'room_id': roomId,
      'user_id': userId,
      'requester_id': userId,
      'seat_number': seatNumber,
      'seat_position': seatNumber,
      'status': 'pending',
    });
  }

  Future<void> cancelSeatRequest({
    required String roomId,
    required String userId,
  }) async {
    await _supabase
        .from('seat_requests')
        .update({
          'status': 'cancelled',
          'responded_at': DateTime.now().toIso8601String(),
        })
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .eq('status', 'pending');
  }

  Future<List<PartySeatRequest>> loadPendingRequests(String roomId) async {
    final rows = await _supabase
        .from('seat_requests')
        .select('id, user_id, requester_id, seat_number, seat_position, created_at')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .order('created_at', ascending: true);
    final list = (rows as List).cast<Map>();
    if (list.isEmpty) return const [];
    final userIds = <String>{
      for (final r in list)
        if ((r['user_id'] ?? r['requester_id']) != null)
          (r['user_id'] ?? r['requester_id']).toString(),
    };
    final profileMap = <String, Map<String, dynamic>>{};
    if (userIds.isNotEmpty) {
      final profs = await _supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level')
          .inFilter('id', userIds.toList());
      for (final p in (profs as List).cast<Map>()) {
        profileMap[p['id'].toString()] = p.cast<String, dynamic>();
      }
    }
    return [
      for (final r in list)
        PartySeatRequest.fromRow(
          r.cast<String, dynamic>(),
          displayName: profileMap[
                  (r['user_id'] ?? r['requester_id']).toString()]
              ?['display_name'] as String?,
          avatarUrl: profileMap[
                  (r['user_id'] ?? r['requester_id']).toString()]
              ?['avatar_url'] as String?,
          userLevel: (profileMap[
                      (r['user_id'] ?? r['requester_id']).toString()]
                  ?['user_level'] as num?)
                  ?.toInt() ??
              0,
        ),
    ];
  }

  /// Host approves — assigns the requester to the seat and closes the request.
  Future<void> approveSeatRequest({
    required String requestId,
    required String roomId,
    required String requesterUserId,
    required int seatNumber,
  }) async {
    await takeSeat(
      roomId: roomId,
      userId: requesterUserId,
      seatNumber: seatNumber,
    );
    await _supabase
        .from('seat_requests')
        .update({
          'status': 'approved',
          'responded_at': DateTime.now().toIso8601String(),
        })
        .eq('id', requestId);
  }

  Future<void> denySeatRequest({required String requestId}) async {
    await _supabase
        .from('seat_requests')
        .update({
          'status': 'denied',
          'responded_at': DateTime.now().toIso8601String(),
        })
        .eq('id', requestId);
  }
}


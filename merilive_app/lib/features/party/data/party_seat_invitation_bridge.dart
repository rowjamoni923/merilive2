import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Phase A P0 #2 — Party seat-invitation client bridge.
///
/// Mirrors web `SeatInvitePickerSheet` + `useSeatInvitationInbox`:
///   • Host writes into `seat_invitations` (RLS-scoped by inviter_id).
///   • Invitee streams incoming pending rows where invitee_id == self.
///   • Accept / decline route through the server RPCs so the seat
///     assignment stays server-authoritative.
class PartySeatInvitationBridge {
  PartySeatInvitationBridge(this._supabase);
  final SupabaseClient _supabase;

  /// Host-side: send an invitation to [inviteeId] for seat [seatNumber].
  /// Idempotent — re-invites for the same seat replace the pending row.
  Future<void> invite({
    required String roomId,
    required String inviterId,
    required String inviteeId,
    required int seatNumber,
  }) async {
    // Clear any prior pending invite for the same (room, invitee, seat)
    // so a re-invite doesn't stack duplicates in the invitee's inbox.
    await _supabase
        .from('seat_invitations')
        .delete()
        .eq('room_id', roomId)
        .eq('invitee_id', inviteeId)
        .eq('seat_number', seatNumber)
        .eq('status', 'pending');

    await _supabase.from('seat_invitations').insert({
      'room_id': roomId,
      'inviter_id': inviterId,
      'invitee_id': inviteeId,
      'seat_number': seatNumber,
    });
  }

  Future<Map<String, dynamic>> accept(String invitationId) async {
    final res = await _supabase
        .rpc('accept_seat_invitation', params: {'p_invitation_id': invitationId});
    if (res is Map) return res.cast<String, dynamic>();
    return const {'ok': true};
  }

  Future<Map<String, dynamic>> decline(String invitationId) async {
    final res = await _supabase
        .rpc('decline_seat_invitation', params: {'p_invitation_id': invitationId});
    if (res is Map) return res.cast<String, dynamic>();
    return const {'ok': true};
  }

  /// Invitee inbox: initial fetch of pending invitations for [inviteeId]
  /// in [roomId] (usually 0 or 1 rows).
  Future<List<PartySeatInvitation>> fetchInbox({
    required String roomId,
    required String inviteeId,
  }) async {
    final rows = await _supabase
        .from('seat_invitations')
        .select(
            'id, room_id, inviter_id, invitee_id, seat_number, status, created_at, expires_at')
        .eq('room_id', roomId)
        .eq('invitee_id', inviteeId)
        .eq('status', 'pending')
        .order('created_at', ascending: false);
    final list = (rows as List).cast<Map>();
    if (list.isEmpty) return const [];

    final inviterIds = <String>{
      for (final r in list) r['inviter_id']?.toString() ?? '',
    }..removeWhere((e) => e.isEmpty);

    final nameById = <String, String>{};
    if (inviterIds.isNotEmpty) {
      final profs = await _supabase
          .from('profiles_public')
          .select('id, display_name')
          .inFilter('id', inviterIds.toList());
      for (final p in (profs as List).cast<Map>()) {
        nameById[p['id'].toString()] = (p['display_name'] as String?) ?? 'Host';
      }
    }
    return [
      for (final r in list)
        PartySeatInvitation.fromRow(
          r.cast<String, dynamic>(),
          inviterName: nameById[r['inviter_id']?.toString()] ?? 'Host',
        ),
    ];
  }

  /// Realtime subscription — [onChanged] fires on every insert/update/delete
  /// of a `seat_invitations` row targeting [inviteeId]. Return the
  /// [RealtimeChannel] so the caller can `removeChannel` on dispose.
  RealtimeChannel subscribeInbox({
    required String roomId,
    required String inviteeId,
    required void Function() onChanged,
  }) {
    final channel = _supabase.channel('seat_invitations:$inviteeId:$roomId');
    channel
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'seat_invitations',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'invitee_id',
          value: inviteeId,
        ),
        callback: (_) => onChanged(),
      )
      ..subscribe();
    return channel;
  }
}

class PartySeatInvitation {
  const PartySeatInvitation({
    required this.id,
    required this.roomId,
    required this.inviterId,
    required this.inviterName,
    required this.inviteeId,
    required this.seatNumber,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final String roomId;
  final String inviterId;
  final String inviterName;
  final String inviteeId;
  final int seatNumber;
  final String status;
  final DateTime createdAt;
  final DateTime? expiresAt;

  bool get isPending => status == 'pending';
  bool get isExpired =>
      expiresAt != null && DateTime.now().isAfter(expiresAt!);

  factory PartySeatInvitation.fromRow(
    Map<String, dynamic> row, {
    required String inviterName,
  }) =>
      PartySeatInvitation(
        id: row['id']?.toString() ?? '',
        roomId: row['room_id']?.toString() ?? '',
        inviterId: row['inviter_id']?.toString() ?? '',
        inviterName: inviterName,
        inviteeId: row['invitee_id']?.toString() ?? '',
        seatNumber: (row['seat_number'] as num?)?.toInt() ?? 0,
        status: (row['status'] as String?) ?? 'pending',
        createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ??
            DateTime.now(),
        expiresAt: DateTime.tryParse(row['expires_at']?.toString() ?? ''),
      );
}

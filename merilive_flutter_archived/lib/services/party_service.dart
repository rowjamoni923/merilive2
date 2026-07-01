import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

enum PartyRoomRole { host, admin, speaker, viewer }

class PartyService extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;
  
  Map<String, dynamic>? _currentRoom;
  List<Map<String, dynamic>> _participants = [];
  List<Map<String, dynamic>> _seatRequests = [];
  bool _isLoading = false;
  
  Map<String, dynamic>? get currentRoom => _currentRoom;
  List<Map<String, dynamic>> get participants => _participants;
  List<Map<String, dynamic>> get seatRequests => _seatRequests;
  bool get isLoading => _isLoading;

  // ========== ROOM ORCHESTRATION (100% Parity) ==========

  Future<void> joinPartyRoom(String roomId) async {
    _isLoading = true;
    notifyListeners();

    try {
      // 1. Fetch Room Data
      final roomRes = await _supabase
          .from('party_rooms')
          .select('*, host:profiles!party_rooms_host_id_fkey(*)')
          .eq('id', roomId)
          .single();
      
      _currentRoom = roomRes;

      // 2. Register as Participant
      final user = _supabase.auth.currentUser;
      if (user != null) {
        final isHost = _currentRoom!['host_id'] == user.id;
        await _supabase.from('party_room_participants').upsert({
          'room_id': roomId,
          'user_id': user.id,
          'role': isHost ? 'host' : 'viewer',
          'position': isHost ? 0 : null,
          'left_at': null,
        }, onConflict: 'room_id,user_id');
      }

      // 3. Setup Real-time Listeners
      _setupRealtimeListeners(roomId);
      
      await refreshRoomData();
    } catch (e) {
      debugPrint('[PartyService] Join Error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void _setupRealtimeListeners(String roomId) {
    // Participant Updates
    _supabase
        .channel('party_participants_$roomId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'party_room_participants',
          filter: 'room_id=eq.$roomId',
          callback: (payload) => refreshRoomData(),
        )
        .subscribe();

    // Seat Request Updates
    _supabase
        .channel('party_seats_$roomId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'seat_requests',
          filter: 'room_id=eq.$roomId',
          callback: (payload) => refreshRoomData(),
        )
        .subscribe();

    // Instant Broadcast (Sub-100ms)
    _supabase.channel('broadcast_$roomId').onBroadcast(
      event: 'seat_action',
      callback: (payload) {
        final data = payload['payload'];
        debugPrint('[PartyService] Instant Seat Action: $data');
        refreshRoomData();
      },
    ).subscribe();
  }

  Future<void> refreshRoomData() async {
    if (_currentRoom == null) return;
    final roomId = _currentRoom!['id'];

    final participantsRes = await _supabase
        .from('party_room_participants')
        .select('*, user:profiles(*)')
        .eq('room_id', roomId)
        .is_('left_at', null)
        .order('position', ascending: true);

    final requestsRes = await _supabase
        .from('seat_requests')
        .select('*, requester:profiles(*)')
        .eq('room_id', roomId)
        .eq('status', 'pending');

    _participants = List<Map<String, dynamic>>.from(participantsRes);
    _seatRequests = List<Map<String, dynamic>>.from(requestsRes);
    notifyListeners();
  }

  // ========== SEAT MANAGEMENT (100% Parity) ==========

  Future<void> requestSeat(int position) async {
    final user = _supabase.auth.currentUser;
    if (user == null || _currentRoom == null) return;

    await _supabase.from('seat_requests').insert({
      'room_id': _currentRoom!['id'],
      'requester_id': user.id,
      'seat_position': position,
      'status': 'pending',
    });
  }

  Future<void> approveSeat(String requestId) async {
    try {
      final request = _seatRequests.firstWhere((r) => r['id'] == requestId);
      final roomId = _currentRoom!['id'];

      // 1. Assign Seat
      await _supabase.from('party_room_participants').update({
        'position': request['seat_position'],
        'role': 'speaker',
      }).eq('room_id', roomId).eq('user_id', request['requester_id']);

      // 2. Update Request Status
      await _supabase
          .from('seat_requests')
          .update({'status': 'approved'}).eq('id', requestId);

      // 3. Instant Broadcast
      await _supabase.channel('broadcast_$roomId').sendBroadcast(
        event: 'seat_action',
        payload: {'action': 'approved', 'requester_id': request['requester_id']},
      );
    } catch (e) {
      debugPrint('[PartyService] Approve Error: $e');
    }
  }

  Future<void> leaveRoom() async {
    final user = _supabase.auth.currentUser;
    if (user == null || _currentRoom == null) return;

    final roomId = _currentRoom!['id'];
    await _supabase.from('party_room_participants').update({
      'left_at': DateTime.now().toIso8601String(),
      'position': null,
    }).eq('room_id', roomId).eq('user_id', user.id);

    _currentRoom = null;
    _participants = [];
    _seatRequests = [];
    notifyListeners();
  }
}

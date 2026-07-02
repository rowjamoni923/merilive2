import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/party_host_video_bridge.dart';
import '../data/party_livekit_service.dart';
import '../data/party_models.dart';
import '../data/party_room_models.dart';
import '../data/party_room_realtime.dart';
import '../data/party_room_repository.dart';
import '../data/party_seat_invitation_bridge.dart';




class PartyRoomState extends Equatable {
  const PartyRoomState({
    this.isLoading = true,
    this.error,
    this.room,
    this.host,
    this.seats = const [],
    this.messages = const [],
    this.isJoined = false,
    this.selfSeat,
    this.isSelfMuted = true,
    this.pendingRequests = const [],
    this.selfRequestSeat,
  });

  final bool isLoading;
  final String? error;
  final PartyRoom? room;
  final PartyHost? host;
  final List<PartySeat> seats;
  final List<PartyChatMessage> messages;
  final bool isJoined;
  final int? selfSeat;
  final bool isSelfMuted;
  final List<PartySeatRequest> pendingRequests;
  final int? selfRequestSeat; // seat number user is waiting on

  int get liveCount =>
      seats.where((s) => !s.isEmpty).length; // seat-occupant count

  PartyRoomState copyWith({
    bool? isLoading,
    String? error,
    PartyRoom? room,
    PartyHost? host,
    List<PartySeat>? seats,
    List<PartyChatMessage>? messages,
    bool? isJoined,
    int? selfSeat,
    bool clearSelfSeat = false,
    bool? isSelfMuted,
    List<PartySeatRequest>? pendingRequests,
    int? selfRequestSeat,
    bool clearSelfRequest = false,
  }) =>
      PartyRoomState(
        isLoading: isLoading ?? this.isLoading,
        error: error,
        room: room ?? this.room,
        host: host ?? this.host,
        seats: seats ?? this.seats,
        messages: messages ?? this.messages,
        isJoined: isJoined ?? this.isJoined,
        selfSeat: clearSelfSeat ? null : (selfSeat ?? this.selfSeat),
        isSelfMuted: isSelfMuted ?? this.isSelfMuted,
        pendingRequests: pendingRequests ?? this.pendingRequests,
        selfRequestSeat: clearSelfRequest
            ? null
            : (selfRequestSeat ?? this.selfRequestSeat),
      );

  @override
  List<Object?> get props => [
        isLoading,
        error,
        room,
        host,
        seats,
        messages,
        isJoined,
        selfSeat,
        isSelfMuted,
        pendingRequests,
        selfRequestSeat,
      ];

}

class PartyRoomCubit extends Cubit<PartyRoomState> {
  PartyRoomCubit({
    required this.roomId,
    required PartyRoomRepository repository,
    required PartyRoomRealtime realtime,
    required SupabaseClient supabase,
    PartyLiveKitService? livekit,
    PartyHostVideoBridge? hostVideo,
  })  : _repo = repository,
        _rt = realtime,
        _supabase = supabase,
        _lk = livekit ?? PartyLiveKitService(supabase),
        _hostVideo = hostVideo ?? PartyHostVideoBridge(supabase),
        super(const PartyRoomState());

  final String roomId;
  final PartyRoomRepository _repo;
  final PartyRoomRealtime _rt;
  final SupabaseClient _supabase;
  final PartyLiveKitService _lk;
  final PartyHostVideoBridge _hostVideo;

  /// Public repo handle for PD7 gift/music sheets.
  PartyRoomRepository get repository => _repo;




  String? get _uid => _supabase.auth.currentUser?.id;
  bool get isHost =>
      _uid != null && state.host != null && state.host!.id == _uid;

  Future<void> start() async {
    try {
      final res = await _repo.loadRoom(roomId);
      final total = res.room.maxParticipants > 0
          ? res.room.maxParticipants
          : 8;
      final seats = await _repo.loadSeats(roomId, total);
      final msgs = await _repo.loadRecentMessages(roomId);

      emit(state.copyWith(
        isLoading: false,
        room: res.room,
        host: res.host,
        seats: seats,
        messages: msgs,
        selfSeat: seats
            .firstWhere(
              (s) => s.userId != null && s.userId == _uid,
              orElse: () => PartySeat.empty(0),
            )
            .seatNumber
            .let((n) => n == 0 ? null : n),
      ));

      // Auto-join as viewer so the participant count reflects presence.
      final uid = _uid;
      if (uid != null) {
        await _repo.joinAsViewer(roomId, uid);
        emit(state.copyWith(isJoined: true));
        // C6 — video/game host reuses the prejoin native camera (Camera2
        // sensor never re-opens). Audio parties + all viewers still use the
        // Dart livekit_client subscribe path.
        final needsHostVideo = isHost &&
            res.room.roomType != PartyRoomType.audio;
        if (needsHostVideo) {
          unawaited(_promoteHostVideo(uid));
        } else {
          unawaited(_connectViewer());
        }
      }

      _rt.subscribe(
        roomId: roomId,
        onParticipantsChanged: _refreshSeats,
        onSeatLocksChanged: _refreshSeats,
        onMessageInsert: _handleMessage,
        onRoomChanged: _refreshRoom,
        onSeatRequestsChanged: _refreshRequests,
      );
      unawaited(_refreshRequests());
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _connectViewer() async {
    try {
      await _lk.connectAsViewer(
        roomId: roomId,
        participantName: _uid ?? 'viewer',
      );
    } catch (_) {
      // Non-fatal: chat/seats still work; user just won't hear audio.
    }
  }

  Future<void> _promoteHostVideo(String uid) async {
    try {
      await _hostVideo.startAsHost(
        roomId: roomId,
        participantName: uid,
      );
    } catch (e) {
      // Fall back to viewer path so the host at least hears the room.
      await _connectViewer();
      emit(state.copyWith(error: e.toString()));
    }
  }




  Future<void> _refreshRoom() async {
    try {
      final res = await _repo.loadRoom(roomId);
      emit(state.copyWith(room: res.room, host: res.host));
    } catch (_) {}
  }

  Future<void> _refreshSeats() async {
    try {
      final total = state.room?.maxParticipants ?? 8;
      final seats = await _repo.loadSeats(roomId, total > 0 ? total : 8);
      final self = seats.firstWhere(
        (s) => s.userId != null && s.userId == _uid,
        orElse: () => PartySeat.empty(0),
      );
      emit(state.copyWith(
        seats: seats,
        selfSeat: self.seatNumber == 0 ? null : self.seatNumber,
        clearSelfSeat: self.seatNumber == 0,
        isSelfMuted:
            self.seatNumber == 0 ? true : (self.isMuted || self.mutedByHost),
      ));
    } catch (_) {}
  }

  Future<void> _handleMessage(Map<String, dynamic> row) async {
    final uid = row['user_id']?.toString();
    String? name;
    String? avatar;
    int level = 0;
    if (uid != null) {
      try {
        final p = await _supabase
            .from('profiles_public')
            .select('display_name, avatar_url, user_level')
            .eq('id', uid)
            .maybeSingle();
        if (p != null) {
          name = p['display_name'] as String?;
          avatar = p['avatar_url'] as String?;
          level = (p['user_level'] as num?)?.toInt() ?? 0;
        }
      } catch (_) {}
    }
    final msg = PartyChatMessage.fromRow(
      row,
      displayName: name,
      avatarUrl: avatar,
      userLevel: level,
    );
    final next = [...state.messages, msg];
    if (next.length > 200) next.removeRange(0, next.length - 200);
    emit(state.copyWith(messages: next));
  }

  Future<void> takeSeat(int seatNumber) async {
    final uid = _uid;
    if (uid == null) return;
    final seat = state.seats.firstWhere(
      (s) => s.seatNumber == seatNumber,
      orElse: () => PartySeat.empty(seatNumber),
    );
    if (!seat.isEmpty || seat.isLocked) return;
    await _repo.takeSeat(roomId: roomId, userId: uid, seatNumber: seatNumber);
    // PD5b — upgrade LiveKit connection to publish-capable (mic starts muted).
    try {
      await _lk.upgradeToSpeaker(roomId: roomId, participantName: uid);
    } catch (e) {
      // Rollback seat if we can't publish (e.g. permission denied).
      try {
        await _repo.leaveSeat(roomId: roomId, userId: uid);
      } catch (_) {}
      await _refreshSeats();
      emit(state.copyWith(error: e.toString()));
      return;
    }
    await _refreshSeats();
  }

  Future<void> leaveSeat() async {
    final uid = _uid;
    if (uid == null) return;
    await _repo.leaveSeat(roomId: roomId, userId: uid);
    // PD5b — drop mic publish, keep listening as viewer.
    try {
      await _lk.downgradeToViewer(roomId: roomId, participantName: uid);
    } catch (_) {}
    await _refreshSeats();
  }

  Future<void> toggleSelfMute() async {
    final uid = _uid;
    if (uid == null || state.selfSeat == null) return;
    final next = !state.isSelfMuted;
    emit(state.copyWith(isSelfMuted: next));
    // PD5b — flip the native mic track. Cheap, no reconnect.
    try {
      await _lk.setMicEnabled(!next);
    } catch (_) {}
    await _repo.toggleSelfMute(roomId: roomId, userId: uid, muted: next);
  }

  Future<void> sendMessage(String text) async {
    final uid = _uid;
    final content = text.trim();
    if (uid == null || content.isEmpty) return;
    await _repo.sendMessage(roomId: roomId, userId: uid, content: content);
  }

  Future<void> hostMute(String participantId, bool muted) async {
    if (!isHost) return;
    await _repo.hostMuteParticipant(
      participantId: participantId,
      muted: muted,
    );
  }

  Future<void> hostKick(String participantId) async {
    if (!isHost) return;
    await _repo.hostKick(participantId: participantId);
  }

  // ─── M4 — Party Room settings + moderation ────────────────────────
  Future<void> hostBan({
    required String participantId,
    required String userId,
  }) async {
    final me = _uid;
    if (!isHost || me == null) return;
    await _repo.banUser(
      hostId: me,
      participantId: participantId,
      userId: userId,
    );
  }

  Future<void> hostMuteAll() async {
    final me = _uid;
    if (!isHost || me == null) return;
    await _repo.muteAllSeats(roomId: roomId, hostId: me);
    await _refreshSeats();
  }

  Future<void> updateRoomSettings({
    String? name,
    String? welcomeMessage,
    String? announcement,
    String? backgroundUrl,
    bool? isLocked,
  }) async {
    if (!isHost) return;
    await _repo.updateRoomSettings(
      roomId: roomId,
      name: name,
      welcomeMessage: welcomeMessage,
      announcement: announcement,
      backgroundUrl: backgroundUrl,
      isLocked: isLocked,
    );
  }

  // ─── PD6 — Seat request flow ──────────────────────────────────────
  Future<void> _refreshRequests() async {
    try {
      final rows = await _repo.loadPendingRequests(roomId);
      final uid = _uid;
      final selfReq = uid == null
          ? null
          : rows.where((r) => r.userId == uid).cast<PartySeatRequest?>().firstWhere(
                (_) => true,
                orElse: () => null,
              );
      emit(state.copyWith(
        pendingRequests: rows,
        selfRequestSeat: selfReq?.seatNumber,
        clearSelfRequest: selfReq == null,
      ));
    } catch (_) {}
  }

  Future<void> requestSeat(int seatNumber) async {
    final uid = _uid;
    if (uid == null || isHost) return;
    if (state.selfSeat != null) return;
    await _repo.requestSeat(
      roomId: roomId,
      userId: uid,
      seatNumber: seatNumber,
    );
    emit(state.copyWith(selfRequestSeat: seatNumber));
    await _refreshRequests();
  }

  Future<void> cancelSeatRequest() async {
    final uid = _uid;
    if (uid == null) return;
    await _repo.cancelSeatRequest(roomId: roomId, userId: uid);
    emit(state.copyWith(clearSelfRequest: true));
    await _refreshRequests();
  }

  Future<void> approveSeatRequest(PartySeatRequest req) async {
    if (!isHost) return;
    // Guard: seat still empty?
    final seat = state.seats.firstWhere(
      (s) => s.seatNumber == req.seatNumber,
      orElse: () => PartySeat.empty(req.seatNumber),
    );
    if (!seat.isEmpty) {
      await _repo.denySeatRequest(requestId: req.id);
      await _refreshRequests();
      return;
    }
    await _repo.approveSeatRequest(
      requestId: req.id,
      roomId: roomId,
      requesterUserId: req.userId,
      seatNumber: req.seatNumber,
    );
    await _refreshRequests();
    await _refreshSeats();
  }

  Future<void> denySeatRequest(PartySeatRequest req) async {
    if (!isHost) return;
    await _repo.denySeatRequest(requestId: req.id);
    await _refreshRequests();
  }

  Future<void> leaveRoom() async {
    final uid = _uid;
    if (uid != null) {
      try {
        await _repo.leaveRoom(roomId: roomId, userId: uid);
      } catch (_) {}
    }
  }

  @override
  Future<void> close() async {
    await _rt.unsubscribe();
    await _lk.disconnect();
    await _hostVideo.stop();
    await leaveRoom();
    return super.close();
  }

}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}

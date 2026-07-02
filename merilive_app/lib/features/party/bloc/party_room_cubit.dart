import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/party_livekit_service.dart';
import '../data/party_models.dart';
import '../data/party_room_models.dart';
import '../data/party_room_realtime.dart';
import '../data/party_room_repository.dart';


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
      ];
}

class PartyRoomCubit extends Cubit<PartyRoomState> {
  PartyRoomCubit({
    required this.roomId,
    required PartyRoomRepository repository,
    required PartyRoomRealtime realtime,
    required SupabaseClient supabase,
    PartyLiveKitService? livekit,
  })  : _repo = repository,
        _rt = realtime,
        _supabase = supabase,
        _lk = livekit ?? PartyLiveKitService(supabase),
        super(const PartyRoomState());

  final String roomId;
  final PartyRoomRepository _repo;
  final PartyRoomRealtime _rt;
  final SupabaseClient _supabase;
  final PartyLiveKitService _lk;


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
        // PD5b — connect to LiveKit as subscribe-only viewer for room audio.
        unawaited(_connectViewer());
      }

      _rt.subscribe(
        roomId: roomId,
        onParticipantsChanged: _refreshSeats,
        onSeatLocksChanged: _refreshSeats,
        onMessageInsert: _handleMessage,
        onRoomChanged: _refreshRoom,
      );
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
    await _refreshSeats();
  }

  Future<void> leaveSeat() async {
    final uid = _uid;
    if (uid == null) return;
    await _repo.leaveSeat(roomId: roomId, userId: uid);
    await _refreshSeats();
  }

  Future<void> toggleSelfMute() async {
    final uid = _uid;
    if (uid == null || state.selfSeat == null) return;
    final next = !state.isSelfMuted;
    emit(state.copyWith(isSelfMuted: next));
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
    await leaveRoom();
    return super.close();
  }
}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}

import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../entry_effects/data/room_entry_dispatcher.dart';
import '../../entry_effects/data/room_join_events_bridge.dart';
import '../../entry_effects/widgets/entry_name_bar_overlay.dart';
import '../../entry_effects/widgets/level_up_celebration_overlay.dart';

import '../../gifting/data/gift_animation_config.dart';
import '../../gifting/data/native_gift_bridge.dart';
import '../../gifting/widgets/full_screen_gift_overlay.dart';
import '../../live/data/live_chat_bridge.dart' show LiveGiftEvent;
import '../bloc/party_room_cubit.dart';
import '../data/party_gift_bridge.dart';
import '../data/party_models.dart';
import '../data/party_room_models.dart';
import '../data/party_room_realtime.dart';
import '../data/party_room_repository.dart';
import '../data/party_seat_invitation_bridge.dart';
import '../widgets/chamet_seat_grid.dart';
import '../widgets/empty_seat_host_actions_sheet.dart';
import '../widgets/game_party_layout.dart';
import '../widgets/invite_viewer_picker_sheet.dart';
import '../widgets/party_banners_strip.dart';
import '../widgets/party_chat_composer.dart';
import '../widgets/party_chat_overlay.dart';
import '../widgets/party_game_overlay.dart';
import '../widgets/party_game_selection_sheet.dart';
import '../widgets/party_gift_sheet.dart';
import '../widgets/party_music_sheet.dart';
import '../widgets/party_room_settings_sheet.dart';
import '../widgets/party_welcome_banner.dart';
import '../widgets/party_host_video_controls.dart';
import '../widgets/party_contributors_sheet.dart';
import '../widgets/party_close_modal.dart';
import '../widgets/party_gift_combo_tracker.dart';
import '../widgets/party_caption_overlay.dart';
import '../widgets/seat_invite_picker_sheet.dart';
import '../widgets/seat_invite_response_sheet.dart';
import '../widgets/video_party_layout.dart';
import '../widgets/party_background_picker_sheet.dart' show parsePartyGradientCss;

import '../../../shared/widgets/room_top_bar.dart';




/// Party Room broadcast + viewer page — PD5.
/// Native LiveKit audio publish is delegated to the platform plugin in the
/// broadcast follow-up; this page renders the full seat grid, chat, and
/// controls so the room is functional immediately for viewers.
@RoutePage()
class PartyRoomPage extends StatefulWidget {
  const PartyRoomPage({super.key, @PathParam('roomId') required this.roomId});

  final String roomId;

  @override
  State<PartyRoomPage> createState() => _PartyRoomPageState();
}

class _PartyRoomPageState extends State<PartyRoomPage> {
  StreamSubscription<LiveGiftEvent>? _giftSub;
  PartyHost? _host;

  @override
  void initState() {
    super.initState();
    // A9 — Attach party gift realtime bridge and dispatch premium gifts
    // through the native VAP/SVGA renderer (Pkg438 plugin); fallback to
    // Flutter FullScreenGiftQueue via GlobalGiftOverlay in main.dart.
    PartyGiftBridge.instance.attach(widget.roomId);
    _giftSub = PartyGiftBridge.instance.gifts$.listen(_onGiftEvent);
    // A11 — Level-up entry animations for party joiners.
    RoomEntryDispatcher.instance.attach(
      surface: RoomJoinSurface.party,
      roomId: widget.roomId,
      selfUserId: Supabase.instance.client.auth.currentUser?.id,
    );
  }

  @override
  void dispose() {
    _giftSub?.cancel();
    PartyGiftBridge.instance.detach();
    NativeGiftBridge.instance.stopAll();
    RoomEntryDispatcher.instance.detach();
    super.dispose();
  }

  Future<void> _onGiftEvent(LiveGiftEvent e) async {
    if (!GiftAnimationConfig.instance.shouldPlayFullScreen(e.perUnitCoins)) {
      return;
    }
    final receiverLabel =
        _host?.displayName ?? 'Host';
    final payload = {
      'id': e.id,
      'kind': (e.animationType ?? '').toLowerCase().isNotEmpty
          ? e.animationType!.toLowerCase()
          : 'image',
      'url': e.animationUrl ?? e.giftIcon ?? '',
      'fallbackImage': e.giftIcon ?? '',
      'durationMs': 3500,
      'priority': e.perUnitCoins,
      'senderName': e.senderName,
      'receiverName': receiverLabel,
      'giftName': e.giftName,
      'quantity': e.quantity,
      'coinValue': e.perUnitCoins,
      'surface': 'party',
    };
    final acceptedByNative =
        await NativeGiftBridge.instance.dispatch(payload);
    if (acceptedByNative) return;

    FullScreenGiftQueue.instance.enqueue(FullScreenGiftPayload(
      id: e.id,
      giftName: e.giftName,
      senderName: e.senderName,
      receiverName: receiverLabel,
      quantity: e.quantity,
      imageUrl: e.giftIcon,
      animationUrl: e.animationUrl,
      animationType: e.animationType,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    return BlocProvider(
      create: (_) => PartyRoomCubit(
        roomId: widget.roomId,
        repository: PartyRoomRepository(supabase),
        realtime: PartyRoomRealtime(supabase),
        supabase: supabase,
      )..start(),
      child: MultiBlocListener(
        listeners: [
          BlocListener<PartyRoomCubit, PartyRoomState>(
            listenWhen: (a, b) => a.host?.id != b.host?.id,
            listener: (_, state) => _host = state.host,
          ),
          // Phase A P0 #2 — Show accept/decline sheet whenever a fresh
          // pending seat invitation arrives.
          BlocListener<PartyRoomCubit, PartyRoomState>(
            listenWhen: (a, b) =>
                a.pendingInvitation?.id != b.pendingInvitation?.id,
            listener: _onInvitation,
          ),
        ],
        child: const _PartyRoomView(),
      ),
    );
  }

  Future<void> _onInvitation(
      BuildContext ctx, PartyRoomState state) async {
    final inv = state.pendingInvitation;
    if (inv == null) return;
    final accepted = await SeatInviteResponseSheet.show(ctx, invitation: inv);
    if (!ctx.mounted) return;
    final cubit = ctx.read<PartyRoomCubit>();
    if (accepted == true) {
      await cubit.acceptSeatInvitation(inv);
    } else {
      await cubit.declineSeatInvitation(inv);
    }
  }
}


class _PartyRoomView extends StatelessWidget {
  const _PartyRoomView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PartyRoomCubit, PartyRoomState>(
      builder: (context, state) {
        if (state.isLoading) {
          return const Scaffold(
            backgroundColor: Color(0xFF1E1B4B),
            body: Center(child: CircularProgressIndicator(color: Colors.white)),
          );
        }
        if (state.error != null || state.room == null) {
          return Scaffold(
            backgroundColor: const Color(0xFF1E1B4B),
            body: Center(
              child: Text(
                state.error ?? 'Room unavailable',
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          );
        }
        final room = state.room!;
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              _Background(url: room.backgroundUrl),
              SafeArea(
                child: Column(
                  children: [
                    _RoomHeader(room: room, host: state.host, live: state.liveCount),
                    const PartyBannersStrip(),
                    PartyWelcomeBanner(roomId: room.id),
                    const SizedBox(height: 4),
                    if (room.roomType == PartyRoomType.game) ...[
                      Expanded(
                        child: _ModeLayout(
                          room: room,
                          seats: state.seats,
                          currentUserId:
                              Supabase.instance.client.auth.currentUser?.id,
                        ),
                      ),
                      SizedBox(
                        height: 140,
                        child: PartyChatOverlay(
                          messages: state.messages,
                          hostId: state.host?.id,
                          currentUserId:
                              Supabase.instance.client.auth.currentUser?.id,
                        ),
                      ),
                    ] else ...[
                      _ModeLayout(
                        room: room,
                        seats: state.seats,
                        currentUserId:
                            Supabase.instance.client.auth.currentUser?.id,
                      ),
                      const SizedBox(height: 4),
                      Expanded(
                        child: PartyChatOverlay(
                          messages: state.messages,
                          hostId: state.host?.id,
                          currentUserId:
                              Supabase.instance.client.auth.currentUser?.id,
                        ),
                      ),
                    ],
                    _BottomBar(state: state),
                  ],
                ),
              ),
              // A11 — Flying entry name-bar overlay on room joins.
              const EntryNameBarOverlay(),
              // M9 — Self level-up celebration overlay.
              const LevelUpCelebrationOverlay(),
              // G19 — Gift combo counter overlay.
              const Positioned(top: 60, right: 0, child: PartyGiftComboTracker()),
              // G24 — Caption overlay (accessibility, off by default).
              PartyCaptionOverlay(roomId: room.id),
            ],

          ),
        );
      },
    );
  }
}

class _Background extends StatelessWidget {
  const _Background({this.url});
  final String? url;
  @override
  Widget build(BuildContext context) {
    // G26 — support `gradient://<linear-gradient(...)>` sentinel produced
    // by PartyBackgroundPickerSheet for admin-configured gradient rows.
    final raw = url ?? '';
    LinearGradient? adminGradient;
    String? imageUrl;
    if (raw.startsWith('gradient://')) {
      adminGradient = parsePartyGradientCss(raw.substring('gradient://'.length));
    } else if (raw.isNotEmpty) {
      imageUrl = raw;
    }
    return Container(
      decoration: BoxDecoration(
        gradient: adminGradient ??
            const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF4C1D95),
                Color(0xFF1E1B4B),
                Color(0xFF0F172A),
              ],
            ),
        image: (imageUrl != null)
            ? DecorationImage(
                image: NetworkImage(imageUrl),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  Colors.black.withValues(alpha: 0.55),
                  BlendMode.darken,
                ),
              )
            : null,
      ),
    );
  }
}


class _RoomHeader extends StatelessWidget {
  const _RoomHeader({required this.room, required this.host, required this.live});
  final PartyRoom room;
  final PartyHost? host;
  final int live;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PartyRoomCubit>();
    final subtitle = [
      if (room.isPrivate) '🔒',
      room.name,
      if (room.roomCode != null && room.roomCode!.isNotEmpty) 'ID ${room.roomCode}',
    ].join(' • ');
    return RoomTopBar(
      hostAvatarUrl: host?.avatarUrl,
      hostName: host?.displayName ?? 'Host',
      subtitle: subtitle,
      showFollow: false,
      viewerCount: live,
      onOpenViewers: () {},
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _RequestsBadge(),
          const SizedBox(width: 6),
          InkResponse(
            onTap: () => PartyContributorsSheet.show(context, room.id),
            radius: 22,
            child: Container(
              width: 34, height: 34,
              decoration: const BoxDecoration(
                color: Color(0x33FFFFFF),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.emoji_events_rounded,
                  color: Color(0xFFFACC15), size: 18),
            ),
          ),
          if (cubit.isHost) ...[
            const SizedBox(width: 6),
            InkResponse(
              onTap: () => PartyRoomSettingsSheet.show(context, room),
              radius: 22,
              child: Container(
                width: 34, height: 34,
                decoration: const BoxDecoration(
                  color: Color(0x33FFFFFF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.settings_rounded,
                    color: Colors.white, size: 18),
              ),
            ),
          ],
        ],
      ),
      onClose: () async {
        final choice = await showPartyCloseModal(context, isHost: cubit.isHost);
        if (choice == PartyCloseChoice.cancel) return;
        if (!context.mounted) return;
        await context.read<PartyRoomCubit>().leaveRoom();
        if (context.mounted) context.router.maybePop();
      },
    );
  }
}



class _ModeLayout extends StatelessWidget {
  const _ModeLayout({
    required this.room,
    required this.seats,
    required this.currentUserId,
  });
  final PartyRoom room;
  final List<PartySeat> seats;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PartyRoomCubit>();
    void tap(PartySeat s) => _handleSeatTap(context, cubit, s);
    switch (room.roomType) {
      case PartyRoomType.video:
        return VideoPartyLayout(
          seats: seats,
          currentUserId: currentUserId,
          onSeatTap: tap,
          room: cubit.liveKitRoom,
        );

      case PartyRoomType.game:
        return GamePartyLayout(
          roomId: room.id,
          seats: seats,
          currentUserId: currentUserId,
          isHost: cubit.isHost,
          onSeatTap: tap,
        );
      case PartyRoomType.audio:
      case PartyRoomType.other:
        return ProfessionalAudioRoom(
          seats: seats,
          currentUserId: currentUserId,
          onSeatTap: tap,
        );
    }
  }



  Future<void> _handleSeatTap(
    BuildContext context,
    PartyRoomCubit cubit,
    PartySeat seat,
  ) async {
    final st = cubit.state;
    if (seat.isEmpty) {
      if (cubit.isHost) {
        // Phase A P0 #4 — Chamet-style empty-seat action sheet for host:
        // move here / invite viewer / lock-unlock.
        await EmptySeatHostActionsSheet.show(
          context,
          seatNumber: seat.seatNumber,
          isLocked: seat.isLocked,
          onMoveHere: () => cubit.takeSeat(seat.seatNumber),
          onToggleLock: () async {
            final res = await cubit.setSeatLock(
              seatNumber: seat.seatNumber,
              locked: !seat.isLocked,
            );
            if (!context.mounted) return;
            final ok = res == null || res['ok'] != false;
            _snack(
              context,
              ok
                  ? (seat.isLocked ? 'Seat unlocked' : 'Seat locked')
                  : (res?['error']?.toString() ?? 'Action failed'),
            );
          },
          onInvite: () => _openInviteFlow(context, cubit, seat.seatNumber),
        );
      } else if (st.selfSeat != null) {
        // already seated, ignore
      } else if (st.selfRequestSeat != null) {
        _snack(context,
            'Request pending for seat ${st.selfRequestSeat}. Cancel first.');
      } else if (seat.isLocked) {
        _snack(context, 'Seat locked by host');
      } else {
        await cubit.requestSeat(seat.seatNumber);
        if (context.mounted) {
          _snack(context, 'Seat request sent to host');
        }
      }
    } else if (seat.userId != null && cubit.isHost && !seat.isHost) {
      _showHostSheet(context, cubit, seat);
    }
  }

  /// Phase A P0 #2 — Host invite flow: pick a viewer → pick a seat number
  /// (defaulted to the seat that was tapped) → write into seat_invitations.
  Future<void> _openInviteFlow(
    BuildContext context,
    PartyRoomCubit cubit,
    int suggestedSeat,
  ) async {
    final room = cubit.state.room;
    final me = Supabase.instance.client.auth.currentUser?.id;
    if (room == null || me == null) return;
    final viewer = await InviteViewerPickerSheet.show(context,
        roomId: room.id);
    if (viewer == null || !context.mounted) return;
    final occupied = <int>[
      for (final s in cubit.state.seats)
        if (!s.isEmpty) s.seatNumber,
    ];
    // Ensure the suggested seat appears first if still free.
    final maxSeats =
        room.maxParticipants > 0 ? room.maxParticipants + 1 : 9;
    final emptySeats = <int>[
      if (!occupied.contains(suggestedSeat)) suggestedSeat,
      for (var i = 1; i < maxSeats; i++)
        if (i != suggestedSeat && !occupied.contains(i)) i,
    ];
    final seatNum = await SeatInvitePickerSheet.show(
      context,
      inviteeName: viewer.displayName,
      emptySeats: emptySeats,
    );
    if (seatNum == null || !context.mounted) return;
    try {
      await cubit.invitations.invite(
        roomId: room.id,
        inviterId: me,
        inviteeId: viewer.id,
        seatNumber: seatNum,
      );
      if (context.mounted) {
        _snack(context,
            'Invited ${viewer.displayName} to seat $seatNum');
      }
    } catch (e) {
      if (context.mounted) _snack(context, 'Invite failed: $e');
    }
  }


  void _showHostSheet(
    BuildContext context,
    PartyRoomCubit cubit,
    PartySeat seat,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1F1B36),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                seat.mutedByHost ? Icons.mic_rounded : Icons.mic_off_rounded,
                color: Colors.white,
              ),
              title: Text(
                seat.mutedByHost ? 'Unmute' : 'Mute',
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () async {
                Navigator.pop(context);
                if (seat.participantId != null) {
                  await cubit.hostMute(
                      seat.participantId!, !seat.mutedByHost);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.person_remove_rounded,
                  color: Colors.orangeAccent),
              title: const Text('Kick from seat',
                  style: TextStyle(color: Colors.orangeAccent)),
              onTap: () async {
                Navigator.pop(context);
                if (seat.participantId != null) {
                  await cubit.hostKick(seat.participantId!);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.block_rounded,
                  color: Colors.redAccent),
              title: const Text('Ban from room',
                  style: TextStyle(color: Colors.redAccent)),
              subtitle: const Text('Kicks and blocks so they cannot rejoin',
                  style: TextStyle(color: Colors.white38, fontSize: 11)),
              onTap: () async {
                Navigator.pop(context);
                if (seat.participantId != null && seat.userId != null) {
                  await cubit.hostBan(
                    participantId: seat.participantId!,
                    userId: seat.userId!,
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}




class _BottomBar extends StatefulWidget {
  const _BottomBar({required this.state});
  final PartyRoomState state;
  @override
  State<_BottomBar> createState() => _BottomBarState();
}

class _BottomBarState extends State<_BottomBar> {
  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PartyRoomCubit>();
    final onSeat = widget.state.selfSeat != null;
    return Container(
      padding: EdgeInsets.only(
        left: 10,
        right: 10,
        top: 6,
        bottom: 6 + MediaQuery.of(context).viewInsets.bottom,
      ),
      color: Colors.black.withValues(alpha: 0.35),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (cubit.isHost &&
              widget.state.room?.roomType != PartyRoomType.audio) ...[
            Align(
              alignment: Alignment.centerRight,
              child: const PartyHostVideoControls(),
            ),
            const SizedBox(height: 6),
          ],
          PartyChatComposer(onSend: cubit.sendMessage),
          const SizedBox(height: 6),
          Row(
            children: [
              if (cubit.isHost)
                _circleBtn(
                  icon: Icons.volume_off_rounded,
                  color: const Color(0xFFEF4444),
                  onTap: () async {
                    await cubit.hostMuteAll();
                    if (context.mounted) {
                      _snack(context, 'All guests muted');
                    }
                  },
                ),
              const Spacer(),
              if (onSeat)
                _circleBtn(
                  icon: widget.state.isSelfMuted
                      ? Icons.mic_off_rounded
                      : Icons.mic_rounded,
                  color: widget.state.isSelfMuted
                      ? Colors.redAccent
                      : Colors.greenAccent,
                  onTap: cubit.toggleSelfMute,
                )
              else
                _circleBtn(
                  icon: Icons.chair_alt_rounded,
                  color: Colors.amber,
                  onTap: () async {
                    final free = widget.state.seats.firstWhere(
                      (s) => s.isEmpty && !s.isLocked,
                      orElse: () => PartySeat.empty(0),
                    );
                    if (free.seatNumber > 0) {
                      await cubit.takeSeat(free.seatNumber);
                    }
                  },
                ),
              const SizedBox(width: 6),
              if (onSeat)
                _circleBtn(
                  icon: Icons.exit_to_app_rounded,
                  color: Colors.white70,
                  onTap: cubit.leaveSeat,
                ),
              _circleBtn(
                icon: Icons.music_note_rounded,
                color: const Color(0xFF10B981),
                onTap: () => showPartyMusicSheet(context),
              ),
              _circleBtn(
                icon: Icons.sports_esports_rounded,
                color: const Color(0xFFA855F7),
                onTap: () => _openGames(context),
              ),
              _circleBtn(
                icon: Icons.card_giftcard_rounded,
                color: Colors.pinkAccent,
                onTap: () => showPartyGiftSheet(context),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _openGames(BuildContext context) async {
    final roomId = context.read<PartyRoomCubit>().state.room?.id;
    if (roomId == null) return;
    final picked = await PartyGameSelectionSheet.show(context);
    if (picked == null || !context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => PartyGameOverlay(roomId: roomId, game: picked),
      ),
    );
  }

  Widget _circleBtn({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) =>
      Padding(
        padding: const EdgeInsets.only(left: 4),
        child: InkResponse(
          onTap: onTap,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.18),
              shape: BoxShape.circle,
              border: Border.all(color: color, width: 1.2),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
        ),
      );
}

// ─── PD6: Seat request UI ─────────────────────────────────────────
void _snack(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(msg),
      duration: const Duration(seconds: 2),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

class _RequestsBadge extends StatelessWidget {
  const _RequestsBadge();
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PartyRoomCubit, PartyRoomState>(
      buildWhen: (a, b) =>
          a.pendingRequests.length != b.pendingRequests.length ||
          a.selfRequestSeat != b.selfRequestSeat,
      builder: (context, state) {
        final cubit = context.read<PartyRoomCubit>();
        // Viewer waiting: show "cancel request" chip.
        if (!cubit.isHost && state.selfRequestSeat != null) {
          return InkWell(
            onTap: cubit.cancelSeatRequest,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.hourglass_top_rounded,
                    size: 13, color: Colors.white),
                const SizedBox(width: 4),
                Text('Seat ${state.selfRequestSeat}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ]),
            ),
          );
        }
        // Host with pending: show badge count → open sheet.
        if (cubit.isHost && state.pendingRequests.isNotEmpty) {
          return InkWell(
            onTap: () => _showRequestsSheet(context, cubit),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.pan_tool_alt_rounded,
                      color: Colors.white, size: 18),
                ),
                Positioned(
                  right: -4,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 18, minHeight: 18),
                    child: Text(
                      '${state.pendingRequests.length}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}

void _showRequestsSheet(BuildContext ctx, PartyRoomCubit cubit) {
  showModalBottomSheet(
    context: ctx,
    backgroundColor: const Color(0xFF1E1B4B),
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: const _RequestsSheet(),
    ),
  );
}

class _RequestsSheet extends StatelessWidget {
  const _RequestsSheet();
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PartyRoomCubit, PartyRoomState>(
      buildWhen: (a, b) => a.pendingRequests != b.pendingRequests,
      builder: (context, state) {
        final cubit = context.read<PartyRoomCubit>();
        final reqs = state.pendingRequests;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.pan_tool_alt_rounded,
                        color: Colors.amber, size: 20),
                    const SizedBox(width: 8),
                    Text('Seat Requests (${reqs.length})',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 12),
                if (reqs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Center(
                      child: Text('No pending requests',
                          style: TextStyle(color: Colors.white54)),
                    ),
                  ),
                for (final r in reqs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: const Color(0xFF6D28D9),
                          backgroundImage:
                              r.avatarUrl != null && r.avatarUrl!.isNotEmpty
                                  ? NetworkImage(r.avatarUrl!)
                                  : null,
                          child: r.avatarUrl == null || r.avatarUrl!.isEmpty
                              ? const Icon(Icons.person,
                                  color: Colors.white70, size: 18)
                              : null,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                r.displayName ?? 'User',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600),
                              ),
                              Text('Wants seat ${r.seatNumber}',
                                  style: const TextStyle(
                                      color: Colors.white54, fontSize: 11)),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => cubit.denySeatRequest(r),
                          icon: const Icon(Icons.close_rounded,
                              color: Colors.redAccent),
                        ),
                        IconButton(
                          onPressed: () async {
                            await cubit.approveSeatRequest(r);
                          },
                          icon: const Icon(Icons.check_circle_rounded,
                              color: Colors.greenAccent),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
              ],
            ),
          ),
        );
      },
    );
  }
}

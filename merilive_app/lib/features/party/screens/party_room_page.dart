import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../entry_effects/data/room_entry_dispatcher.dart';
import '../../entry_effects/data/room_join_events_bridge.dart';
import '../../entry_effects/widgets/entry_name_bar_overlay.dart';
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
import '../widgets/chamet_seat_grid.dart';
import '../widgets/game_party_layout.dart';
import '../widgets/party_banners_strip.dart';
import '../widgets/party_chat_composer.dart';
import '../widgets/party_chat_overlay.dart';
import '../widgets/party_game_overlay.dart';
import '../widgets/party_game_selection_sheet.dart';
import '../widgets/party_gift_sheet.dart';
import '../widgets/party_music_sheet.dart';
import '../widgets/party_room_settings_sheet.dart';
import '../widgets/video_party_layout.dart';
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
      child: BlocListener<PartyRoomCubit, PartyRoomState>(
        listenWhen: (a, b) => a.host?.id != b.host?.id,
        listener: (_, state) => _host = state.host,
        child: const _PartyRoomView(),
      ),
    );
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
                    const SizedBox(height: 6),
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
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF4C1D95), Color(0xFF1E1B4B), Color(0xFF0F172A)],
        ),
        image: (url != null && url!.isNotEmpty)
            ? DecorationImage(
                image: NetworkImage(url!),
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
      trailing: const _RequestsBadge(),
      onClose: () async {
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
        return ChametSeatGrid(
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
        await cubit.takeSeat(seat.seatNumber);
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
                  color: Colors.redAccent),
              title: const Text('Kick from seat',
                  style: TextStyle(color: Colors.redAccent)),
              onTap: () async {
                Navigator.pop(context);
                if (seat.participantId != null) {
                  await cubit.hostKick(seat.participantId!);
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
          PartyChatComposer(onSend: cubit.sendMessage),
          const SizedBox(height: 6),
          Row(
            children: [
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

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../bloc/party_room_cubit.dart';
import '../data/party_models.dart';
import '../data/party_room_models.dart';
import '../data/party_room_realtime.dart';
import '../data/party_room_repository.dart';
import '../widgets/party_gift_sheet.dart';
import '../widgets/party_music_sheet.dart';


/// Party Room broadcast + viewer page — PD5.
/// Native LiveKit audio publish is delegated to the platform plugin in the
/// broadcast follow-up; this page renders the full seat grid, chat, and
/// controls so the room is functional immediately for viewers.
@RoutePage()
class PartyRoomPage extends StatelessWidget {
  const PartyRoomPage({super.key, @PathParam('roomId') required this.roomId});

  final String roomId;

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    return BlocProvider(
      create: (_) => PartyRoomCubit(
        roomId: roomId,
        repository: PartyRoomRepository(supabase),
        realtime: PartyRoomRealtime(supabase),
        supabase: supabase,
      )..start(),
      child: const _PartyRoomView(),
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
                    _SeatGrid(seats: state.seats),
                    const SizedBox(height: 4),
                    Expanded(child: _ChatList(messages: state.messages)),
                    _BottomBar(state: state),
                  ],
                ),
              ),
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          _hostAvatar(),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (room.isPrivate)
                      const Padding(
                        padding: EdgeInsets.only(right: 4),
                        child: Icon(Icons.lock_rounded,
                            size: 14, color: Colors.amber),
                      ),
                    Flexible(
                      child: Text(
                        room.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Text(
                      host?.displayName ?? 'Host',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(width: 6),
                    if (room.roomCode != null && room.roomCode!.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'ID ${room.roomCode}',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 10,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          _liveCountPill(live),
          const SizedBox(width: 6),
          _RequestsBadge(),
          const SizedBox(width: 6),
          _iconBtn(Icons.close_rounded, () async {
            await context.read<PartyRoomCubit>().leaveRoom();
            if (context.mounted) context.router.maybePop();
          }),
        ],
      ),
    );
  }


  Widget _hostAvatar() {
    final url = host?.avatarUrl;
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.amber, width: 2),
        image: url != null && url.isNotEmpty
            ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover)
            : null,
        color: const Color(0xFF6D28D9),
      ),
      child: url == null || url.isEmpty
          ? const Icon(Icons.person, color: Colors.white70, size: 20)
          : null,
    );
  }

  Widget _liveCountPill(int n) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.people_alt_rounded, size: 13, color: Colors.white70),
          const SizedBox(width: 4),
          Text('$n',
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600)),
        ]),
      );

  Widget _iconBtn(IconData i, VoidCallback onTap) => InkResponse(
        onTap: onTap,
        radius: 22,
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.4),
            shape: BoxShape.circle,
          ),
          child: Icon(i, color: Colors.white, size: 18),
        ),
      );
}

class _SeatGrid extends StatelessWidget {
  const _SeatGrid({required this.seats});
  final List<PartySeat> seats;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          childAspectRatio: 0.78,
          crossAxisSpacing: 6,
          mainAxisSpacing: 6,
        ),
        itemCount: seats.length,
        itemBuilder: (context, i) => _SeatTile(seat: seats[i]),
      ),
    );
  }
}

class _SeatTile extends StatelessWidget {
  const _SeatTile({required this.seat});
  final PartySeat seat;
  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PartyRoomCubit>();
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
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
          _showHostSheet(context, cubit);
        }
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: seat.isHost
                ? Colors.amber
                : Colors.white.withValues(alpha: 0.15),
            width: seat.isHost ? 1.6 : 1,
          ),
        ),
        padding: const EdgeInsets.all(6),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: const Color(0xFF4C1D95),
                  backgroundImage:
                      seat.avatarUrl != null && seat.avatarUrl!.isNotEmpty
                          ? NetworkImage(seat.avatarUrl!)
                          : null,
                  child: seat.isEmpty
                      ? Icon(
                          seat.isLocked
                              ? Icons.lock_rounded
                              : Icons.add_rounded,
                          color: Colors.white70,
                          size: 18,
                        )
                      : (seat.avatarUrl == null || seat.avatarUrl!.isEmpty)
                          ? const Icon(Icons.person,
                              color: Colors.white70, size: 20)
                          : null,
                ),
                if (!seat.isEmpty && (seat.isMuted || seat.mutedByHost))
                  Container(
                    width: 16,
                    height: 16,
                    decoration: const BoxDecoration(
                      color: Colors.redAccent,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.mic_off,
                        size: 10, color: Colors.white),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              seat.isEmpty ? '${seat.seatNumber}' : (seat.displayName ?? '—'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: seat.isEmpty
                    ? Colors.white.withValues(alpha: 0.5)
                    : Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showHostSheet(BuildContext context, PartyRoomCubit cubit) {
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
                  await cubit.hostMute(seat.participantId!, !seat.mutedByHost);
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

class _ChatList extends StatelessWidget {
  const _ChatList({required this.messages});
  final List<PartyChatMessage> messages;
  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return Center(
        child: Text('Say hi 👋',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
      );
    }
    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      itemCount: messages.length,
      itemBuilder: (_, i) {
        final m = messages[messages.length - 1 - i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(14),
            ),
            child: RichText(
              text: TextSpan(
                style: const TextStyle(fontSize: 12, color: Colors.white),
                children: [
                  TextSpan(
                    text: '${m.displayName ?? "User"}: ',
                    style: const TextStyle(
                        color: Colors.amberAccent,
                        fontWeight: FontWeight.w600),
                  ),
                  TextSpan(text: m.content),
                ],
              ),
            ),
          ),
        );
      },
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
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

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
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              maxLength: 200,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                counterText: '',
                hintText: 'Say something…',
                hintStyle:
                    TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.08),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
              ),
              onSubmitted: (v) async {
                await cubit.sendMessage(v);
                _ctrl.clear();
              },
            ),
          ),
          const SizedBox(width: 6),
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
                // Take first free unlocked seat.
                final free = widget.state.seats.firstWhere(
                  (s) => s.isEmpty && !s.isLocked,
                  orElse: () => PartySeat.empty(0),
                );
                if (free.seatNumber > 0) await cubit.takeSeat(free.seatNumber);
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
            icon: Icons.card_giftcard_rounded,
            color: Colors.pinkAccent,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Gift panel — arrives with gifting bridge'),
                duration: Duration(seconds: 2),
              ));
            },
          ),
        ],
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

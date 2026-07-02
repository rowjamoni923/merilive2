import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart' as lk;

import '../data/party_room_models.dart';

/// Phase A P0 #3 — Per-seat video tiles for the video party layout.
///
/// Renders 4 seat tiles (2×2). For each seat with an occupant, we look up
/// the matching LiveKit participant (identity = user id) and mount their
/// camera track via `VideoTrackRenderer`. Falls back to the avatar tile
/// when no track is published (audio-only seat / host on native bridge).
class VideoPartyLayout extends StatefulWidget {
  const VideoPartyLayout({
    super.key,
    required this.seats,
    required this.currentUserId,
    required this.onSeatTap,
    required this.room,
  });

  final List<PartySeat> seats;
  final String? currentUserId;
  final void Function(PartySeat seat) onSeatTap;
  final lk.Room? room;

  @override
  State<VideoPartyLayout> createState() => _VideoPartyLayoutState();
}

class _VideoPartyLayoutState extends State<VideoPartyLayout> {
  lk.EventsListener<lk.RoomEvent>? _listener;

  @override
  void initState() {
    super.initState();
    _attach(widget.room);
  }

  @override
  void didUpdateWidget(covariant VideoPartyLayout oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.room != widget.room) {
      _detach();
      _attach(widget.room);
    }
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  void _attach(lk.Room? room) {
    if (room == null) return;
    final l = room.createListener();
    l
      ..on<lk.TrackSubscribedEvent>((_) => _rebuild())
      ..on<lk.TrackUnsubscribedEvent>((_) => _rebuild())
      ..on<lk.TrackPublishedEvent>((_) => _rebuild())
      ..on<lk.TrackUnpublishedEvent>((_) => _rebuild())
      ..on<lk.LocalTrackPublishedEvent>((_) => _rebuild())
      ..on<lk.LocalTrackUnpublishedEvent>((_) => _rebuild())
      ..on<lk.ParticipantConnectedEvent>((_) => _rebuild())
      ..on<lk.ParticipantDisconnectedEvent>((_) => _rebuild());
    _listener = l;
  }

  Future<void> _detach() async {
    final l = _listener;
    _listener = null;
    if (l != null) {
      try {
        await l.dispose();
      } catch (_) {}
    }
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  lk.VideoTrack? _videoTrackFor(String userId) {
    final room = widget.room;
    if (room == null) return null;

    // Local participant (this device is publishing camera).
    final lp = room.localParticipant;
    if (lp != null && lp.identity == userId) {
      for (final pub in lp.videoTrackPublications) {
        final track = pub.track;
        if (track is lk.LocalVideoTrack &&
            pub.source == lk.TrackSource.camera) {
          return track;
        }
      }
      return null;
    }

    // Remote participant matching this seat.
    for (final rp in room.remoteParticipants.values) {
      if (rp.identity != userId) continue;
      for (final pub in rp.videoTrackPublications) {
        final track = pub.track;
        if (track is lk.RemoteVideoTrack &&
            pub.source == lk.TrackSource.camera &&
            pub.subscribed &&
            !pub.muted) {
          return track;
        }
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final tiles = <PartySeat>[
      for (var i = 0; i <= 3; i++)
        widget.seats.firstWhere((s) => s.seatNumber == i,
            orElse: () => PartySeat.empty(i)),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: LayoutBuilder(builder: (context, c) {
        final tile = (c.maxWidth - 12) / 2;
        return Center(
          child: SizedBox(
            width: tile * 2 + 12,
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final s in tiles)
                  SizedBox(
                    width: tile,
                    height: tile,
                    child: _VideoTile(
                      seat: s,
                      isMe: s.userId != null && s.userId == widget.currentUserId,
                      videoTrack:
                          s.userId != null ? _videoTrackFor(s.userId!) : null,
                      onTap: () => widget.onSeatTap(s),
                    ),
                  ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class _VideoTile extends StatelessWidget {
  const _VideoTile({
    required this.seat,
    required this.isMe,
    required this.videoTrack,
    required this.onTap,
  });
  final PartySeat seat;
  final bool isMe;
  final lk.VideoTrack? videoTrack;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final empty = seat.isEmpty;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: (empty || videoTrack != null)
              ? null
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xCC6D28D9), Color(0xCC3730A3)],
                ),
          color: empty
              ? const Color(0x554C1D95)
              : (videoTrack != null ? Colors.black : null),
          border: Border.all(
            color: empty
                ? const Color(0x33A855F7)
                : (seat.isHost
                    ? const Color(0xFFF59E0B)
                    : Colors.white.withValues(alpha: 0.15)),
            width: 1.2,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (empty)
              _EmptyTile(seatNumber: seat.seatNumber, locked: seat.isLocked)
            else ...[
              // Video first (behind), avatar fallback if no track.
              if (videoTrack != null)
                lk.VideoTrackRenderer(
                  videoTrack!,
                  fit: lk.VideoViewFit.cover,
                )
              else
                Center(
                  child: CircleAvatar(
                    radius: 36,
                    backgroundColor: const Color(0xFF312E81),
                    backgroundImage: (seat.avatarUrl != null &&
                            seat.avatarUrl!.isNotEmpty)
                        ? NetworkImage(seat.avatarUrl!)
                        : null,
                    child: (seat.avatarUrl == null || seat.avatarUrl!.isEmpty)
                        ? Text(
                            (seat.displayName ?? '?')
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold),
                          )
                        : null,
                  ),
                ),
              _NameOverlay(seat: seat),
              if (isMe)
                Positioned(
                  top: 6,
                  right: 6,
                  child: _tag('You'),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _tag(String label) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700)),
      );
}

class _EmptyTile extends StatelessWidget {
  const _EmptyTile({required this.seatNumber, required this.locked});
  final int seatNumber;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(locked ? Icons.lock_rounded : Icons.chair_alt_rounded,
              size: 40,
              color: locked
                  ? const Color(0xFFF59E0B)
                  : const Color(0x88A855F7)),
          const SizedBox(height: 6),
          Text(locked ? 'Locked' : 'Seat ${seatNumber + 1}',
              style: TextStyle(
                  color: locked
                      ? const Color(0xFFF59E0B)
                      : const Color(0xCCE9D5FF),
                  fontSize: 12,
                  fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _NameOverlay extends StatelessWidget {
  const _NameOverlay({required this.seat});
  final PartySeat seat;
  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: 8,
      child: Row(
        children: [
          if (seat.isHost)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: Icon(Icons.workspace_premium_rounded,
                  size: 14, color: Color(0xFFF59E0B)),
            ),
          Expanded(
            child: Text(
              seat.displayName ?? 'Guest',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
              ),
            ),
          ),
          if (seat.mutedByHost || seat.isMuted)
            const Icon(Icons.mic_off_rounded,
                size: 14, color: Colors.redAccent),
        ],
      ),
    );
  }
}

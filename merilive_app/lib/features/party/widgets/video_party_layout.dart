import 'package:flutter/material.dart';

import '../data/party_room_models.dart';

/// Video party layout — mirrors web `ChametStyleVideoRoom.tsx` 2×2 grid.
///
/// Seats 0..3 render as aspect-square video tiles. The actual camera
/// pixels are published by the native LiveKit plugin (see
/// `PartyHostVideoBridge`) and rendered on the platform surface behind
/// the Flutter tree — this widget only draws the seat frames + avatar
/// fallback + speaking glow.
class VideoPartyLayout extends StatelessWidget {
  const VideoPartyLayout({
    super.key,
    required this.seats,
    required this.currentUserId,
    required this.onSeatTap,
  });

  final List<PartySeat> seats;
  final String? currentUserId;
  final void Function(PartySeat seat) onSeatTap;

  @override
  Widget build(BuildContext context) {
    final tiles = <PartySeat>[
      for (var i = 0; i <= 3; i++)
        seats.firstWhere((s) => s.seatNumber == i,
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
                      isMe: s.userId != null && s.userId == currentUserId,
                      onTap: () => onSeatTap(s),
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
  const _VideoTile(
      {required this.seat, required this.isMe, required this.onTap});
  final PartySeat seat;
  final bool isMe;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final empty = seat.isEmpty;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: empty
              ? null
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xCC6D28D9), Color(0xCC3730A3)],
                ),
          color: empty ? const Color(0x554C1D95) : null,
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
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.chair_alt_rounded,
                        size: 40, color: Color(0x88A855F7)),
                    const SizedBox(height: 6),
                    Text('Seat ${seat.seatNumber + 1}',
                        style: const TextStyle(
                            color: Color(0xCCE9D5FF),
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              )
            else ...[
              Center(
                child: CircleAvatar(
                  radius: 36,
                  backgroundColor: const Color(0xFF312E81),
                  backgroundImage: (seat.avatarUrl != null &&
                          seat.avatarUrl!.isNotEmpty)
                      ? NetworkImage(seat.avatarUrl!)
                      : null,
                  child:
                      (seat.avatarUrl == null || seat.avatarUrl!.isEmpty)
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
              Positioned(
                left: 8,
                bottom: 8,
                right: 8,
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
                          shadows: [
                            Shadow(color: Colors.black54, blurRadius: 4),
                          ],
                        ),
                      ),
                    ),
                    if (seat.mutedByHost || seat.isMuted)
                      const Icon(Icons.mic_off_rounded,
                          size: 14, color: Colors.redAccent),
                  ],
                ),
              ),
              if (isMe)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('You',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../data/party_games_bridge.dart';
import '../data/party_room_models.dart';
import 'party_game_banners_row.dart';
import 'party_game_overlay.dart';
import 'party_game_selection_sheet.dart';

/// Game party layout — mirrors web `ChametStyleGameRoom.tsx`.
///
/// Compact horizontal seat strip on top (host + up to 4 mic seats),
/// then a large game area that hosts the active game WebView via
/// [PartyGameOverlay]. Host taps the "Change game" chip to swap games.
class GamePartyLayout extends StatefulWidget {
  const GamePartyLayout({
    super.key,
    required this.roomId,
    required this.seats,
    required this.currentUserId,
    required this.isHost,
    required this.onSeatTap,
  });

  final String roomId;
  final List<PartySeat> seats;
  final String? currentUserId;
  final bool isHost;
  final void Function(PartySeat seat) onSeatTap;

  @override
  State<GamePartyLayout> createState() => _GamePartyLayoutState();
}

class _GamePartyLayoutState extends State<GamePartyLayout> {
  PartyGame? _game;

  @override
  Widget build(BuildContext context) {
    final strip = <PartySeat>[
      for (var i = 0; i <= 4; i++)
        widget.seats.firstWhere((s) => s.seatNumber == i,
            orElse: () => PartySeat.empty(i)),
    ];

    return Column(
      children: [
        _SeatStrip(
          seats: strip,
          currentUserId: widget.currentUserId,
          onSeatTap: widget.onSeatTap,
        ),
        const SizedBox(height: 6),
        if (widget.isHost && _game == null)
          PartyGameBannersRow(onPick: (_) => _pickGame()),
        const SizedBox(height: 6),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                color: Colors.black.withValues(alpha: 0.55),
                child: _game == null
                    ? _GamePlaceholder(
                        isHost: widget.isHost,
                        onPick: _pickGame,
                      )
                    : Stack(
                        children: [
                          Positioned.fill(
                            child: PartyGameOverlay(
                              roomId: widget.roomId,
                              game: _game!,
                            ),
                          ),
                          if (widget.isHost)
                            Positioned(
                              top: 8,
                              right: 8,
                              child: _ChangeChip(onTap: _pickGame),
                            ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _pickGame() async {
    final picked = await PartyGameSelectionSheet.show(context);
    if (picked != null && mounted) setState(() => _game = picked);
  }
}

class _GamePlaceholder extends StatelessWidget {
  const _GamePlaceholder({required this.isHost, required this.onPick});
  final bool isHost;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.sports_esports_rounded,
              size: 56, color: Color(0x88A855F7)),
          const SizedBox(height: 10),
          Text(
            isHost ? 'Pick a game to start' : 'Waiting for host to start a game',
            style: const TextStyle(color: Colors.white70),
          ),
          if (isHost) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onPick,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFA855F7),
              ),
              icon: const Icon(Icons.videogame_asset_rounded),
              label: const Text('Choose game'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChangeChip extends StatelessWidget {
  const _ChangeChip({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white24),
        ),
        child: const Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.swap_horiz_rounded, size: 14, color: Colors.white),
          SizedBox(width: 4),
          Text('Change', style: TextStyle(color: Colors.white, fontSize: 12)),
        ]),
      ),
    );
  }
}

class _SeatStrip extends StatelessWidget {
  const _SeatStrip({
    required this.seats,
    required this.currentUserId,
    required this.onSeatTap,
  });
  final List<PartySeat> seats;
  final String? currentUserId;
  final void Function(PartySeat) onSeatTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (final s in seats) _StripSeat(seat: s, onTap: () => onSeatTap(s)),
        ],
      ),
    );
  }
}

class _StripSeat extends StatelessWidget {
  const _StripSeat({required this.seat, required this.onTap});
  final PartySeat seat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final empty = seat.isEmpty;
    final ringColor = seat.isHost
        ? const Color(0xFFF59E0B)
        : (empty ? const Color(0x55A855F7) : const Color(0xFF10B981));
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: ringColor, width: 2),
              color: Colors.black.withValues(alpha: 0.35),
            ),
            child: empty
                ? const Icon(Icons.add_rounded, color: Colors.white54, size: 22)
                : ClipOval(
                    child: (seat.avatarUrl != null &&
                            seat.avatarUrl!.isNotEmpty)
                        ? Image.network(seat.avatarUrl!, fit: BoxFit.cover)
                        : Center(
                            child: Text(
                              (seat.displayName ?? '?')
                                  .substring(0, 1)
                                  .toUpperCase(),
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold),
                            ),
                          ),
                  ),
          ),
          const SizedBox(height: 3),
          Text(
            empty
                ? (seat.isHost ? 'Host' : '${seat.seatNumber}')
                : (seat.displayName ?? 'Guest'),
            style: const TextStyle(color: Colors.white70, fontSize: 10),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

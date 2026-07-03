import 'package:flutter/material.dart';

import '../data/party_room_models.dart';
import 'chamet_seat_grid.dart';

/// G10 — Professional audio-room layout.
///
/// Wraps [ChametSeatGrid] with an audio-mode header pill (title + seated
/// count) matching the web `ProfessionalAudioRoom` variant. The seat grid
/// itself already renders per-seat mute badges, so this is a pure
/// composition wrapper — no duplicate seat logic.
class ProfessionalAudioRoom extends StatelessWidget {
  const ProfessionalAudioRoom({
    super.key,
    required this.seats,
    required this.currentUserId,
    required this.onSeatTap,
    this.title = 'Audio Room',
  });

  final List<PartySeat> seats;
  final String? currentUserId;
  final void Function(PartySeat seat) onSeatTap;
  final String title;

  @override
  Widget build(BuildContext context) {
    final seated = seats.where((s) => s.userId != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          child: Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.graphic_eq,
                        size: 14, color: Colors.white),
                    const SizedBox(width: 6),
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$seated / ${seats.length}',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ChametSeatGrid(
            seats: seats,
            currentUserId: currentUserId,
            onSeatTap: onSeatTap,
          ),
        ),
      ],
    );
  }
}

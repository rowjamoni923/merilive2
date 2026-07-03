import 'package:flutter/material.dart';

import '../data/party_games_bridge.dart';

/// G22 — Professional game overlay for audio-mode party rooms.
///
/// A compact top-strip overlay that shows the active game name + a host
/// "End game" pill so audio-only rooms can still play seat-count games
/// (Ludo/Dice/etc) without the full game-mode layout.
class ProfessionalGameOverlay extends StatelessWidget {
  const ProfessionalGameOverlay({
    super.key,
    required this.game,
    required this.isHost,
    required this.onEnd,
  });

  final PartyGame? game;
  final bool isHost;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context) {
    if (game == null) return const SizedBox.shrink();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF7C3AED), Color(0xFF4C1D95)],
            ),
            borderRadius: BorderRadius.circular(999),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videogame_asset,
                  size: 16, color: Colors.white),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  game!.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (isHost) ...[
                const SizedBox(width: 10),
                InkWell(
                  onTap: onEnd,
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'End',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

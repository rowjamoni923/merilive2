import 'package:flutter/material.dart';

import '../data/party_games_bridge.dart';

/// A10 — Bottom-sheet game picker for party rooms.
///
/// Displays the SAME admin-managed games as the web
/// (`src/components/party/GameSelectionModal.tsx`). Never invent new games.
class PartyGameSelectionSheet extends StatefulWidget {
  const PartyGameSelectionSheet({super.key, this.currentGameId});

  final String? currentGameId;

  static Future<PartyGame?> show(
    BuildContext context, {
    String? currentGameId,
  }) {
    return showModalBottomSheet<PartyGame>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.7),
      builder: (_) => PartyGameSelectionSheet(currentGameId: currentGameId),
    );
  }

  @override
  State<PartyGameSelectionSheet> createState() =>
      _PartyGameSelectionSheetState();
}

class _PartyGameSelectionSheetState extends State<PartyGameSelectionSheet> {
  late Future<List<PartyGame>> _future;

  @override
  void initState() {
    super.initState();
    _future = PartyGamesBridge.instance.fetchActiveGames();
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * 0.75;
    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1E1B4B), Color(0xFF111827)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 30,
            offset: Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [
                        Color(0xFFA855F7),
                        Color(0xFFEC4899),
                        Color(0xFFF97316),
                      ]),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child:
                        const Icon(Icons.sports_esports_rounded, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Party Games',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          'Same games as web · admin managed',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Flexible(
              child: FutureBuilder<List<PartyGame>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child:
                            CircularProgressIndicator(color: Colors.white70),
                      ),
                    );
                  }
                  if (snap.hasError) {
                    return _emptyOrError(
                      'Failed to load games',
                      Icons.error_outline_rounded,
                    );
                  }
                  final games = snap.data ?? const [];
                  if (games.isEmpty) {
                    return _emptyOrError(
                      'No games configured by admin',
                      Icons.videogame_asset_off_rounded,
                    );
                  }
                  return GridView.builder(
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 18),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.82,
                    ),
                    itemCount: games.length,
                    itemBuilder: (_, i) => _GameCard(
                      game: games[i],
                      isSelected: games[i].id == widget.currentGameId,
                      onTap: () => Navigator.of(context).pop(games[i]),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyOrError(String label, IconData icon) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: Colors.white38),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
}

class _GameCard extends StatelessWidget {
  const _GameCard({
    required this.game,
    required this.isSelected,
    required this.onTap,
  });

  final PartyGame game;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF4C1D95), Color(0xFFDB2777)],
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isSelected
                ? Colors.white
                : Colors.white.withValues(alpha: 0.1),
            width: isSelected ? 2.2 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: (game.logoUrl != null && game.logoUrl!.isNotEmpty)
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        game.logoUrl!,
                        width: 44,
                        height: 44,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Text(
                          game.emoji,
                          style: const TextStyle(fontSize: 30),
                        ),
                      ),
                    )
                  : Text(
                      game.emoji,
                      style: const TextStyle(fontSize: 30),
                    ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                game.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                game.description,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75),
                  fontSize: 9.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

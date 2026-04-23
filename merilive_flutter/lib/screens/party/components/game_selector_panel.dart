import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../theme/app_theme.dart';
import '../../../services/game_service.dart';
import 'greedy_game_overlay.dart';
import 'dart:ui';

class GameSelectorPanel extends StatelessWidget {
  const GameSelectorPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final gameService = context.watch<GameService>();

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
      child: Container(
        height: 400,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 20),
              width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Icon(Icons.gamepad, color: Colors.amber, size: 20),
                  SizedBox(width: 10),
                  Text("Live Games", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: gameService.isLoading 
                ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryPink))
                : GridView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 15,
                      crossAxisSpacing: 15,
                      childAspectRatio: 0.8,
                    ),
                    itemCount: gameService.activeGames.length,
                    itemBuilder: (context, index) {
                      final game = gameService.activeGames[index];
                      return _buildGameItem(context, game);
                    },
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGameItem(BuildContext context, Map<String, dynamic> game) {
    return GestureDetector(
      onTap: () {
        Navigator.pop(context);
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          isScrollControlled: true,
          builder: (context) => const GreedyGameOverlay(),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(game['game_emoji'] ?? '🎮', style: const TextStyle(fontSize: 40)),
            const SizedBox(height: 10),
            Text(
              game['game_name'] ?? 'Game',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../services/game_service.dart';
import '../../../theme/app_theme.dart';
import 'dart:ui';
import 'dart:async';

class GreedyGameOverlay extends StatefulWidget {
  const GreedyGameOverlay({super.key});

  @override
  State<GreedyGameOverlay> createState() => _GreedyGameOverlayState();
}

class _GreedyGameOverlayState extends State<GreedyGameOverlay> {
  int _timer = 30;
  Timer? _countdown;
  int _selectedAmount = 10;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _countdown = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_timer > 0) {
        setState(() => _timer--);
      } else {
        setState(() => _timer = 30); // Reset for next round
      }
    });
  }

  @override
  void dispose() {
    _countdown?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
      child: Container(
        height: 500,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.85),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          children: [
            _buildHeader(),
            const SizedBox(height: 20),
            _buildGameGrid(),
            const Spacer(),
            _buildBettingControls(),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Row(
            children: [
              Text("🎰", style: TextStyle(fontSize: 24)),
              SizedBox(width: 10),
              Text("GREEDY FRUIT", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
            decoration: BoxDecoration(color: AppTheme.primaryPink.withOpacity(0.2), borderRadius: BorderRadius.circular(20), border: Border.all(color: AppTheme.primaryPink.withOpacity(0.3))),
            child: Row(
              children: [
                const Icon(Icons.timer_outlined, color: AppTheme.primaryPink, size: 16),
                const SizedBox(width: 5),
                Text("00:${_timer.toString().padLeft(2, '0')}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGameGrid() {
    final List<Map<String, dynamic>> options = [
      {'icon': '🍉', 'mult': 'x5', 'color': Colors.green},
      {'icon': '⭐', 'mult': 'x10', 'color': Colors.amber},
      {'icon': '🍎', 'mult': 'x20', 'color': Colors.red},
      {'icon': '🔔', 'mult': 'x45', 'color': Colors.blue},
      {'icon': '💎', 'mult': 'x100', 'color': Colors.cyan},
      {'icon': '👑', 'mult': 'x250', 'color': Colors.purple},
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 15,
          crossAxisSpacing: 15,
          childAspectRatio: 1.1,
        ),
        itemCount: options.length,
        itemBuilder: (context, index) {
          final opt = options[index];
          return GestureDetector(
            onTap: () => _placeBet(opt['icon']),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: opt['color'].withOpacity(0.3), width: 1.5),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(opt['icon'], style: const TextStyle(fontSize: 30)),
                  const SizedBox(height: 5),
                  Text(opt['mult'], style: TextStyle(color: opt['color'], fontSize: 14, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildBettingControls() {
    final amounts = [10, 100, 500, 1000, 5000];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: amounts.map((amt) => GestureDetector(
              onTap: () => setState(() => _selectedAmount = amt),
              child: Container(
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: _selectedAmount == amt ? AppTheme.primaryPink : Colors.white10,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(amt.toString(), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            )).toList(),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
            decoration: BoxDecoration(color: Colors.amber.withOpacity(0.2), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.amber.withOpacity(0.3))),
            child: const Row(
              children: [
                Text("💎", style: TextStyle(fontSize: 14)),
                SizedBox(width: 5),
                Text("1,240", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _placeBet(String option) {
    HapticFeedback.mediumImpact();
    // Use GameService to place bet
  }
}

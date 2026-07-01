import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';
import 'dart:math' as math;
import '../../services/api_service.dart';
import '../../services/sound_service.dart';
import '../../utils/design_system.dart';

class SlotsScreen extends StatefulWidget {
  const SlotsScreen({super.key});

  @override
  State<SlotsScreen> createState() => _SlotsScreenState();
}

class _SlotsScreenState extends State<SlotsScreen> with TickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  final SoundService _soundService = SoundService();
  
  late List<AnimationController> _reelControllers;
  late List<Animation<double>> _reelAnimations;
  
  bool _isLoading = true;
  bool _isSpinning = false;
  int _selectedBet = 50;
  List<int> _betOptions = [10, 50, 100, 500];
  
  final List<String> _symbols = ['🍒', '🍋', '🍉', '🔔', '💎', '7️⃣'];
  List<int> _currentIndices = [0, 0, 0];
  String? _winMessage;

  @override
  void initState() {
    super.initState();
    _reelControllers = List.generate(3, (i) => AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 2000 + (i * 500)),
    ));
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final config = await _apiService.getGameConfig('slots');
    if (mounted) {
      setState(() {
        _betOptions = List<int>.from(config['bet_options'] ?? [10, 50, 100, 500]);
        _selectedBet = _betOptions.first;
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    for (var controller in _reelControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _spin() async {
    if (_isSpinning) return;

    setState(() {
      _isSpinning = true;
      _winMessage = null;
    });

    // 1. Play Secure Game via Server-Side RPC (A-Z Parity)
    final res = await _apiService.playSecureGame(gameId: 'slots', amount: _selectedBet);
    
    if (!res['success']) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(res['error'] ?? 'Engine Error'),
          backgroundColor: Colors.redAccent,
        ));
        setState(() => _isSpinning = false);
      }
      return;
    }

    final bool isWin = res['is_win'] ?? false;
    final int payout = (res['payout'] ?? 0).toInt();
    final List<int> serverReels = List<int>.from(res['result_data']['reels'] ?? [0, 0, 0]);

    _soundService.playEffect('audio/games/slot_machine_lever.mp3');
    _soundService.playEffect('audio/games/reel_spin_loop.mp3');

    // 2. Start Animations
    for (int i = 0; i < 3; i++) {
      // Calculate stop point: multiples of symbols length + target index
      final double targetStop = (20 + (i * 10) + serverReels[i]).toDouble();
      
      _reelAnimations = List.generate(3, (index) => Tween<double>(
        begin: 0,
        end: targetStop,
      ).animate(CurvedAnimation(
        parent: _reelControllers[index],
        curve: Curves.easeOutCubic,
      )));

      _reelControllers[i].forward(from: 0.0).then((_) {
        if (i == 2) {
          if (!mounted) return;
          setState(() {
             _isSpinning = false;
             _currentIndices = serverReels;
             
             if (isWin) {
               _winMessage = payout > _selectedBet * 5 ? "JACKPOT! 🏆" : "BIG WIN! 💰";
               _soundService.playWin();
             } else {
               _winMessage = "BETTER LUCK NEXT TIME!";
             }
          });
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.amber)));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Stack(
        fit: StackFit.expand,
        children: [
          App3DDesign.buildAmbientGlow(context),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                const Spacer(),
                
                // 3D Professional Logo Integration
                Image.asset(
                  'assets/3d/slots.png',
                  height: 120,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 10),
                
                // The Slot Machine Cabinet
                _buildSlotCabinet(),
                
                const Spacer(),
                
                if (_winMessage != null) _buildWinOverlay(),
                
                _buildActionPanel(),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNeonBackground() {
     return const SizedBox.shrink(); // Replaced by global ambient glow
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white70), onPressed: () => Navigator.pop(context)),
          Text("LUCKY SLOTS", style: GoogleFonts.lexend(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 3)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.amber.withOpacity(0.3))),
            child: Row(
              children: [
                App3DDesign.diamondIcon(size: 14),
                const SizedBox(width: 8),
                Text("24,500", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSlotCabinet() {
    return Container(
      width: 340,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Colors.grey.shade900, Colors.black, Colors.grey.shade900],
        ),
        borderRadius: BorderRadius.circular(40),
        border: Border.all(color: Colors.amber.withOpacity(0.5), width: 4),
        boxShadow: [
          BoxShadow(color: Colors.amber.withOpacity(0.1), blurRadius: 40, spreadRadius: 10),
        ],
      ),
      child: Column(
        children: [
          // Reel Window
          Container(
            height: 180,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: List.generate(3, (i) => _buildReel(i)),
            ),
          ),
          const SizedBox(height: 20),
          // Decorative Lights
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (index) => Container(
              width: 8, height: 8,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(shape: BoxShape.circle, color: _isSpinning && index % 2 == 0 ? Colors.amber : Colors.white24, boxShadow: [if(_isSpinning) const BoxShadow(color: Colors.amber, blurRadius: 5)]),
            )),
          )
        ],
      ),
    );
  }

  Widget _buildReel(int reelIndex) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Colors.white.withOpacity(0.05), Colors.white.withOpacity(0.15), Colors.white.withOpacity(0.05)],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        clipBehavior: Clip.antiAlias,
        child: AnimatedBuilder(
          animation: _reelControllers[reelIndex],
          builder: (context, child) {
            double value = _reelControllers[reelIndex].value * 10; // offset
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(1, (_) {
                int index = (_currentIndices[reelIndex] + value.round()) % _symbols.length;
                return Transform.scale(
                  scale: 0.8 + (math.sin(_reelControllers[reelIndex].value * math.pi) * 0.2), // Subtle pulse while spinning
                  child: Text(_symbols[index], style: const TextStyle(fontSize: 48)),
                );
              }),
            );
          },
        ),
      ),
    );
  }

  Widget _buildWinOverlay() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Colors.amber.withOpacity(0.4), Colors.amber.withOpacity(0.1)]),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.amber),
      ),
      child: Text(_winMessage!, style: GoogleFonts.lexend(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2)),
    );
  }

  Widget _buildActionPanel() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: _betOptions.map((val) => _buildChip(val)).toList(),
          ),
          const SizedBox(height: 24),
          GestureDetector(
            onTap: _isSpinning ? null : _spin,
            child: Container(
              height: 70,
              width: double.infinity,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: _isSpinning ? [Colors.grey.shade900, Colors.black] : [const Color(0xFFFBBF24), const Color(0xFFD43F8D)],
                ),
                borderRadius: BorderRadius.circular(35),
                boxShadow: [
                  if(!_isSpinning) BoxShadow(color: const Color(0xFFD43F8D).withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 10)),
                ],
              ),
              child: Center(
                child: Text(
                  _isSpinning ? "SPINNING..." : "SPIN",
                  style: GoogleFonts.lexend(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 4),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChip(int val) {
    bool isSelected = _selectedBet == val;
    return GestureDetector(
      onTap: () {
        _soundService.playClick();
        setState(() => _selectedBet = val);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.symmetric(horizontal: 8),
        width: 50, height: 50,
        decoration: BoxDecoration(
          color: isSelected ? Colors.amber : Colors.white.withOpacity(0.05),
          shape: BoxShape.circle,
          border: Border.all(color: isSelected ? Colors.amber : Colors.white12, width: 2),
          boxShadow: [if(isSelected) BoxShadow(color: Colors.amber.withOpacity(0.3), blurRadius: 10)],
        ),
        child: Center(
          child: Text("$val", style: GoogleFonts.inter(color: isSelected ? Colors.black : Colors.white70, fontWeight: FontWeight.bold, fontSize: 12)),
        ),
      ),
    );
  }
}



import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';
import 'dart:math' as math;
import '../../services/api_service.dart';
import '../../services/sound_service.dart';
import '../../utils/design_system.dart';

class RouletteScreen extends StatefulWidget {
  const RouletteScreen({super.key});

  @override
  State<RouletteScreen> createState() => _RouletteScreenState();
}

class _RouletteScreenState extends State<RouletteScreen> with SingleTickerProviderStateMixin {
  late AnimationController _rotationController;
  late Animation<double> _wheelRotation;
  
  final ApiService _apiService = ApiService();
  final SoundService _soundService = SoundService();
  
  double _currentWheelAngle = 0;
  bool _isSpinning = false;
  bool _isLoading = true;
  int _selectedBet = 50;
  List<int> _betOptions = [10, 50, 100, 500];
  
  // Roulette Logic Mapping
  final List<int> _rouletteNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  int? _winningNumber;

  @override
  void initState() {
    super.initState();
    _rotationController = AnimationController(vsync: this, duration: const Duration(seconds: 5));
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final config = await _apiService.getGameConfig('roulette');
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
    _rotationController.dispose();
    super.dispose();
  }

  Future<void> _spin() async {
    if (_isSpinning) return;

    setState(() {
      _isSpinning = true;
      _winningNumber = null;
    });

    // 1. Play Secure Game via Server-Side RPC
    final res = await _apiService.playSecureGame(gameId: 'roulette', amount: _selectedBet);
    
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

    final int winNum = (res['result_data']['raw_roll'] % 37).toInt(); // Simple mapping for roulette
    final bool isWin = res['is_win'] ?? false;
    final int payout = (res['payout'] ?? 0).toInt();
    final int newBalance = (res['new_balance'] ?? 0).toInt();

    // 2. Align Visual Animation with Server Result
    // Angle per number is 2*pi / 37
    double anglePerNumber = (2 * math.pi) / _rouletteNumbers.length;
    int targetIndex = _rouletteNumbers.indexOf(winNum);
    
    // Pointer is at the top (3*pi/2). 
    // Target angle = (3*pi/2 - targetIndex * anglePerNumber)
    double targetStopAngle = (1.5 * math.pi) - (targetIndex * anglePerNumber);
    while (targetStopAngle < 0) targetStopAngle += 2 * math.pi;

    _soundService.playEffect('audio/games/roulette_spin.mp3');
    
    // Add multiple full rotations (7 full spins) for suspense
    final double totalRotation = (14 * math.pi) + targetStopAngle - (_currentWheelAngle % (2 * math.pi));

    _wheelRotation = Tween<double>(
      begin: _currentWheelAngle,
      end: _currentWheelAngle + totalRotation,
    ).animate(CurvedAnimation(parent: _rotationController, curve: Curves.easeOutCubic));

    _rotationController.forward(from: 0.0).then((_) {
      if (!mounted) return;
      _currentWheelAngle = _wheelRotation.value;
      _winningNumber = winNum;
      
      setState(() {
        _isSpinning = false;
        // Update wallet from server response
        // Note: In a full implementation, you'd update a provider or global state
      });
      
      _soundService.playEffect('audio/games/ball_drop.mp3');
      if (isWin) _soundService.playWin();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF030303), body: Center(child: CircularProgressIndicator(color: Colors.green)));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Elegant Casino Table Feel
          _buildTableBackground(),
          
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                
                // Top: The Wheel
                _buildWheelSection(),
                
                if (_winningNumber != null) _buildWinDisplay(),
                
                const SizedBox(height: 20),
                
                // Bottom: Betting Table
                Expanded(child: _buildBettingGrid()),
                
                // Bottom Bar: Chips & Spin
                _buildActionPanel(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableBackground() {
     return App3DDesign.buildAmbientGlow(context);
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white70), onPressed: () => Navigator.pop(context)),
          Text("ROYAL ROULETTE", style: GoogleFonts.lexend(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20)),
            child: Row(
              children: [
                App3DDesign.diamondIcon(size: 14),
                const SizedBox(width: 8),
                Text("24,500", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWheelSection() {
    return Container(
      height: 220,
      margin: const EdgeInsets.symmetric(vertical: 0),
      child: Center(
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Ambient Glow
            Container(
              width: 250, height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.1), blurRadius: 100)],
              ),
            ),
            // The Spinning 3D Wheel
            AnimatedBuilder(
              animation: _rotationController,
              builder: (context, child) {
                return Transform.rotate(
                  angle: _isSpinning ? _wheelRotation.value : _currentWheelAngle,
                  child: Image.asset(
                    'assets/3d/roulette.png',
                    height: 220,
                    fit: BoxFit.contain,
                  ),
                );
              },
            ),
            // Fixed Pointer
            Positioned(
              top: 0,
              child: Container(
                width: 4, height: 20,
                decoration: BoxDecoration(
                  color: Colors.amberAccent,
                  boxShadow: [BoxShadow(color: Colors.amberAccent.withOpacity(0.5), blurRadius: 5)],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWinDisplay() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
      child: Text("NUMBER $_winningNumber WON!", style: GoogleFonts.lexend(color: Colors.amber, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildBettingGrid() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 1.5,
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
        ),
        itemCount: 37,
        itemBuilder: (context, index) {
          final isZero = index == 0;
          return Container(
            decoration: BoxDecoration(
              color: isZero ? Colors.green : (index % 2 == 0 ? Colors.red.withOpacity(0.8) : Colors.black87),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: Colors.white24),
            ),
            child: Center(
              child: Text("$index", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActionPanel() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.black,
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: _betOptions.map((val) => _buildChip(val)).toList(),
          ),
          GestureDetector(
             onTap: _isSpinning ? null : _spin,
             child: Container(
               width: 120, height: 48,
               decoration: BoxDecoration(
                 gradient: LinearGradient(colors: _isSpinning ? [Colors.grey, Colors.black] : [const Color(0xFF10B981), const Color(0xFF059669)]),
                 borderRadius: BorderRadius.circular(24),
                 boxShadow: [if(!_isSpinning) BoxShadow(color: const Color(0xFF10B981).withOpacity(0.3), blurRadius: 10)],
               ),
               child: Center(child: Text(_isSpinning ? "WAIT" : "SPIN", style: GoogleFonts.lexend(color: Colors.white, fontWeight: FontWeight.w900))),
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
        margin: const EdgeInsets.only(right: 8),
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: isSelected ? Colors.amber : Colors.white.withOpacity(0.1),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 2),
        ),
        child: Center(child: Text("$val", style: GoogleFonts.inter(color: isSelected ? Colors.black : Colors.white, fontSize: 10, fontWeight: FontWeight.bold))),
      ),
    );
  }
}

class RoulettePainter extends CustomPainter {
  final List<int> numbers;
  RoulettePainter({required this.numbers});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final double anglePerNum = (2 * math.pi) / numbers.length;

    for (int i = 0; i < numbers.length; i++) {
      final startAngle = i * anglePerNum;
      final paint = Paint()
        ..color = numbers[i] == 0 ? Colors.green : (i % 2 == 0 ? Colors.black : Colors.red)
        ..style = PaintingStyle.fill;

      canvas.drawArc(Rect.fromCircle(center: center, radius: radius), startAngle, anglePerNum, true, paint);

      // Text for numbers
      final double textAngle = startAngle + anglePerNum / 2;
      final TextPainter textPainter = TextPainter(
        text: TextSpan(text: "${numbers[i]}", style: GoogleFonts.inter(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
        textDirection: TextDirection.ltr,
      )..layout();

      canvas.save();
      canvas.translate(center.dx + math.cos(textAngle) * (radius - 12), center.dy + math.sin(textAngle) * (radius - 12));
      canvas.rotate(textAngle + math.pi / 2);
      textPainter.paint(canvas, Offset(-textPainter.width / 2, -textPainter.height / 2));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}



import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';
import 'dart:math' as math;
import '../../services/api_service.dart';
import '../../services/sound_service.dart';
import '../../utils/design_system.dart';

class FerrisWheelScreen extends StatefulWidget {
  const FerrisWheelScreen({super.key});

  @override
  State<FerrisWheelScreen> createState() => _FerrisWheelScreenState();
}

class _FerrisWheelScreenState extends State<FerrisWheelScreen> with SingleTickerProviderStateMixin {
  late AnimationController _rotationController;
  late Animation<double> _rotationAnimation;
  
  final ApiService _apiService = ApiService();
  final SoundService _soundService = SoundService();
  
  double _currentRotation = 0;
  int _selectedBet = 50;
  bool _isSpinning = false;
  String _lastResult = "";
  List<int> _betOptions = [10, 50, 100, 500];
  bool _isLoading = true;
  
  final List<WheelSegment> _segments = [
    WheelSegment(multiplier: '2x', color: const Color(0xFF3B82F6), weight: 40),
    WheelSegment(multiplier: '5x', color: const Color(0xFF8B5CF6), weight: 20),
    WheelSegment(multiplier: '10x', color: const Color(0xFFD946EF), weight: 10),
    WheelSegment(multiplier: '2x', color: const Color(0xFF3B82F6), weight: 40),
    WheelSegment(multiplier: '50x', color: const Color(0xFFFBBF24), weight: 2),
    WheelSegment(multiplier: '5x', color: const Color(0xFF8B5CF6), weight: 20),
    WheelSegment(multiplier: '2x', color: const Color(0xFF3B82F6), weight: 40),
    WheelSegment(multiplier: '10x', color: const Color(0xFFD946EF), weight: 10),
  ];

  @override
  void initState() {
    super.initState();
    _rotationController = AnimationController(vsync: this, duration: const Duration(seconds: 4));
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final config = await _apiService.getGameConfig('ferris_wheel');
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
      _lastResult = "";
    });

    // 1. Play Secure Game via Server-Side RPC (A-Z Parity)
    final res = await _apiService.playSecureGame(gameId: 'ferris_wheel', amount: _selectedBet);
    
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

    // 2. Extract Server Result
    final bool isWin = res['is_win'] ?? false;
    final int payout = (res['payout'] ?? 0).toInt();
    final int roll = (res['result_data']['raw_roll'] ?? 0).toInt();
    
    // Logic to select target segment based on server roll
    // We map the server roll to one of our segments
    int targetIndex = roll % _segments.length;
    String targetMultiplier = _segments[targetIndex].multiplier;

    // Premium Sound: Start Spin
    _soundService.playEffect('audio/games/spin_start.mp3');

    // Calculate target stop angle
    double anglePerSegment = (2 * math.pi) / _segments.length;
    // Pointer is at the top (3*pi/2).
    double targetStopAngle = (1.5 * math.pi) - (targetIndex * anglePerSegment);
    while (targetStopAngle < 0) targetStopAngle += 2 * math.pi;

    // Suspense: Add 6 full rotations
    final double totalRotation = (12 * math.pi) + targetStopAngle - (_currentRotation % (2 * math.pi));

    _rotationAnimation = Tween<double>(
      begin: _currentRotation,
      end: _currentRotation + totalRotation,
    ).animate(CurvedAnimation(parent: _rotationController, curve: Curves.easeOutCubic));

    _rotationController.forward(from: 0.0).then((_) {
      if (!mounted) return;
      _currentRotation = _rotationAnimation.value;
      _lastResult = targetMultiplier;
      setState(() => _isSpinning = false);
      
      // Update balance logic here if needed (payout)
      
      // Premium Sound: Big win or normal end
      if (isWin && (targetMultiplier == '50x' || targetMultiplier == '10x')) {
        _soundService.playWin();
      } else if (isWin) {
        _soundService.playEffect('audio/games/win_small.mp3');
      } else {
        _soundService.playEffect('audio/games/loss_low.mp3');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF020617), body: Center(child: CircularProgressIndicator(color: Color(0xFF8B5CF6))));
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
                const SizedBox(height: 20),
                Expanded(
                  flex: 3,
                  child: Center(
                    child: Transform(
                      transform: Matrix4.identity()..setEntry(3, 2, 0.001)..rotateX(0.25),
                      alignment: FractionalOffset.center,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: 330, height: 330,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.3), blurRadius: 60, spreadRadius: 10),
                                BoxShadow(color: const Color(0xFFD946EF).withOpacity(0.1), blurRadius: 100, spreadRadius: 20),
                              ],
                            ),
                          ),
                          AnimatedBuilder(
                            animation: _rotationController,
                            builder: (context, child) {
                              return Transform.rotate(
                                angle: _isSpinning ? _rotationAnimation.value : _currentRotation,
                                child: Image.asset(
                                  'assets/3d/ferris_wheel.png',
                                  width: 310,
                                  height: 310,
                                  fit: BoxFit.contain,
                                ),
                              );
                            },
                          ),
                          Container(
                            width: 64, height: 64,
                            decoration: BoxDecoration(
                              gradient: const RadialGradient(colors: [Color(0xFF312E81), Color(0xFF1E1B4B)]),
                              shape: BoxShape.circle,
                              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 15)],
                            ),
                            child: Center(child: App3DDesign.diamondIcon(size: 32)),
                          ),
                          Positioned(
                            top: -10,
                            child: Container(
                              width: 34, height: 44,
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444),
                                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
                                border: Border.all(color: Colors.white.withOpacity(0.2)),
                                boxShadow: [BoxShadow(color: Colors.red.withOpacity(0.6), blurRadius: 15)],
                              ),
                              child: const Icon(LucideIcons.chevronDown, color: Colors.white, size: 18),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (_lastResult.isNotEmpty) _buildResultBanner(),
                const SizedBox(height: 10),
                Expanded(flex: 2, child: _buildBettingPanel()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackgroundGlows() {
     return const SizedBox.shrink(); // Replaced by global ambient glow
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          Text("Magic Wheel Pro", style: GoogleFonts.lexend(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.amber.withOpacity(0.3))),
            child: Row(
              children: [
                App3DDesign.diamondIcon(size: 14),
                const SizedBox(width: 6),
                Text("24,500", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [const Color(0xFF10B981).withOpacity(0.3), const Color(0xFF10B981).withOpacity(0.05)]),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.5)),
      ),
      child: Text("YOU WON $_lastResult!", style: GoogleFonts.lexend(color: const Color(0xFF34D399), fontWeight: FontWeight.w900, fontSize: 22, letterSpacing: 1)),
    );
  }

  Widget _buildBettingPanel() {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(48)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
        child: Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.02),
            border: Border(top: BorderSide(color: Colors.white.withOpacity(0.1))),
          ),
          child: Column(
            children: [
              Text("SELECT BET AMOUNT", style: GoogleFonts.inter(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
              const SizedBox(height: 20),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: _betOptions.map((val) => _buildBetChip(val)).toList()),
              ),
              const Spacer(),
              GestureDetector(
                onTap: _isSpinning ? null : _spin,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  height: 64,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: _isSpinning ? [Colors.grey.shade800, Colors.grey.shade900] : [const Color(0xFFFBBF24), const Color(0xFFD97706)],
                    ),
                    borderRadius: BorderRadius.circular(32),
                    boxShadow: _isSpinning ? [] : [BoxShadow(color: const Color(0xFFD97706).withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 8))],
                  ),
                  child: Center(
                    child: Text(
                      _isSpinning ? "SPINNING..." : "SPIN NOW",
                      style: GoogleFonts.lexend(color: _isSpinning ? Colors.white24 : Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBetChip(int amount) {
    bool isSelected = _selectedBet == amount;
    return GestureDetector(
      onTap: () {
        _soundService.playClick();
        setState(() => _selectedBet = amount);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.symmetric(horizontal: 8),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF8B5CF6).withOpacity(0.3) : Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: isSelected ? const Color(0xFF8B5CF6) : Colors.white.withOpacity(0.1), width: isSelected ? 2 : 1),
          boxShadow: isSelected ? [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.2), blurRadius: 10)] : [],
        ),
        child: Row(
          children: [
            App3DDesign.diamondIcon(size: 14),
            const SizedBox(width: 8),
            Text("$amount", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

class WheelPainter extends CustomPainter {
  final List<WheelSegment> segments;
  WheelPainter({required this.segments});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final double anglePerSegment = (2 * math.pi) / segments.length;

    for (int i = 0; i < segments.length; i++) {
       final startAngle = i * anglePerSegment;
       final paint = Paint()
        ..shader = RadialGradient(
          colors: [segments[i].color, segments[i].color.withOpacity(0.6)],
          stops: const [0.6, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: radius))
        ..style = PaintingStyle.fill;
       
       canvas.drawArc(Rect.fromCircle(center: center, radius: radius), startAngle, anglePerSegment, true, paint);

       final borderPaint = Paint()..color = Colors.white.withOpacity(0.15)..strokeWidth = 1..style = PaintingStyle.stroke;
       canvas.drawArc(Rect.fromCircle(center: center, radius: radius), startAngle, anglePerSegment, true, borderPaint);

       final double textAngle = startAngle + anglePerSegment / 2;
       final TextPainter textPainter = TextPainter(
         text: TextSpan(
           text: segments[i].multiplier,
           style: GoogleFonts.lexend(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black.withOpacity(0.5), blurRadius: 8)]),
         ),
         textDirection: TextDirection.ltr,
       )..layout();

       canvas.save();
       canvas.translate(center.dx + math.cos(textAngle) * radius * 0.7, center.dy + math.sin(textAngle) * radius * 0.7);
       canvas.rotate(textAngle + math.pi / 2);
       textPainter.paint(canvas, Offset(-textPainter.width / 2, -textPainter.height / 2));
       canvas.restore();
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

class WheelSegment {
  final String multiplier;
  final Color color;
  final double weight;
  WheelSegment({required this.multiplier, required this.color, required this.weight});
}



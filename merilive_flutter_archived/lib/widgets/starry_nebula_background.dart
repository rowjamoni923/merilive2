import 'package:flutter/material.dart';
import 'dart:math' as math;
import 'dart:ui';

class StarryNebulaBackground extends StatefulWidget {
  final Widget? child;
  const StarryNebulaBackground({super.key, this.child});

  @override
  State<StarryNebulaBackground> createState() => _StarryNebulaBackgroundState();
}

class _StarryNebulaBackgroundState extends State<StarryNebulaBackground> with TickerProviderStateMixin {
  late AnimationController _twinkleController;
  late AnimationController _shootingStarController;
  final List<StarModel> _stars = [];
  ShootingStarModel? _shootingStar;
  final math.Random _random = math.Random();

  @override
  void initState() {
    super.initState();
    _twinkleController = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat(reverse: true);
    _shootingStarController = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500));
    
    // Initialize static stars
    for (int i = 0; i < 60; i++) {
      _stars.add(StarModel(
        offset: Offset(_random.nextDouble(), _random.nextDouble()),
        size: _random.nextDouble() * 2 + 1,
        twinkleDelay: _random.nextDouble(),
      ));
    }

    _startShootingStarTimer();
  }

  void _startShootingStarTimer() {
    Future.delayed(Duration(seconds: 3 + _random.nextInt(5)), () {
      if (!mounted) return;
      _triggerShootingStar();
      _startShootingStarTimer();
    });
  }

  void _triggerShootingStar() {
    setState(() {
      _shootingStar = ShootingStarModel(
        start: Offset(_random.nextDouble() * 0.8, _random.nextDouble() * 0.4),
        angle: math.pi / 4 + (_random.nextDouble() * 0.2),
      );
    });
    _shootingStarController.forward(from: 0);
  }

  @override
  void dispose() {
    _twinkleController.dispose();
    _shootingStarController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 1. Deep Gradient Base
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF7C3AED), // 0%
                Color(0xFF8B5CF6), // 15%
                Color(0xFFA78BFA), // 35%
                Color(0xFFC4B5FD), // 55%
                Color(0xFFDDD6FE), // 75%
                Color(0xFF818CF8), // 100%
              ],
            ),
          ),
        ),

        // 2. Animated Stars Layer
        AnimatedBuilder(
          animation: _twinkleController,
          builder: (context, child) {
            return CustomPaint(
              size: Size.infinite,
              painter: StarsPainter(
                stars: _stars,
                twinkleProgress: _twinkleController.value,
                shootingStar: _shootingStar,
                shootingProgress: _shootingStarController.value,
              ),
            );
          },
        ),

        // 3. Subtle Mist Overlay
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  Colors.white.withOpacity(0.15),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),

        if (widget.child != null) widget.child!,
      ],
    );
  }
}

class StarModel {
  final Offset offset;
  final double size;
  final double twinkleDelay;
  StarModel({required this.offset, required this.size, required this.twinkleDelay});
}

class ShootingStarModel {
  final Offset start;
  final double angle;
  ShootingStarModel({required this.start, required this.angle});
}

class StarsPainter extends CustomPainter {
  final List<StarModel> stars;
  final double twinkleProgress;
  final ShootingStarModel? shootingStar;
  final double shootingProgress;

  StarsPainter({
    required this.stars,
    required this.twinkleProgress,
    this.shootingStar,
    required this.shootingProgress,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;

    // Draw static twinkling stars
    for (var star in stars) {
      final opacity = (0.3 + 0.7 * math.sin((twinkleProgress + star.twinkleDelay) * math.pi)).clamp(0.0, 1.0);
      paint.color = Colors.white.withOpacity(opacity);
      canvas.drawCircle(
        Offset(star.offset.dx * size.width, star.offset.dy * size.height),
        star.size,
        paint,
      );
    }

    // Draw shooting star
    if (shootingStar != null && shootingProgress > 0 && shootingProgress < 1) {
      final startX = shootingStar!.start.dx * size.width;
      final startY = shootingStar!.start.dy * size.height;
      final distance = 200.0 * shootingProgress;
      
      final currentX = startX + math.cos(shootingStar!.angle) * distance;
      final currentY = startY + math.sin(shootingStar!.angle) * distance;

      final trailPaint = Paint()
        ..shader = LinearGradient(
          colors: [Colors.white.withOpacity(0.8), Colors.transparent],
        ).createShader(Rect.fromPoints(
          Offset(currentX, currentY),
          Offset(startX + math.cos(shootingStar!.angle) * (distance - 80), 
                 startY + math.sin(shootingStar!.angle) * (distance - 80)),
        ))
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round;

      canvas.drawLine(
        Offset(currentX, currentY),
        Offset(startX + math.cos(shootingStar!.angle) * (distance - 60), 
               startY + math.sin(shootingStar!.angle) * (distance - 60)),
        trailPaint,
      );
      
      canvas.drawCircle(Offset(currentX, currentY), 2, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant StarsPainter oldDelegate) => true;
}



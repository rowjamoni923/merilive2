import 'package:flutter/material.dart';

class Diamond3DIcon extends StatelessWidget {
  final double size;
  const Diamond3DIcon({super.key, this.size = 24});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Basic faceted diamond using CustomPaint for high performance
          CustomPaint(
            size: Size(size, size),
            painter: _DiamondPainter(),
          ),
          // Inner Glow/Sparkle
          Container(
            width: size * 0.4,
            height: size * 0.4,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withOpacity(0.5),
                  blurRadius: size * 0.2,
                  spreadRadius: size * 0.1,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DiamondPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    final w = size.width;
    final h = size.height;

    // Top Facet (Brightest)
    paint.color = const Color(0xFFE8F4FD);
    final topPath = Path()
      ..moveTo(w * 0.5, h * 0.1)
      ..lineTo(w * 0.3, h * 0.3)
      ..lineTo(w * 0.5, h * 0.3)
      ..lineTo(w * 0.7, h * 0.3)
      ..close();
    canvas.drawPath(topPath, paint);

    // Left Facet
    paint.shader = LinearGradient(
      colors: [const Color(0xFF748FFC), const Color(0xFF4C6EF5)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ).createShader(Rect.fromLTWH(0, 0, w, h));
    final leftPath = Path()
      ..moveTo(w * 0.125, h * 0.3)
      ..lineTo(w * 0.3, h * 0.3)
      ..lineTo(w * 0.5, h * 0.1)
      ..close();
    canvas.drawPath(leftPath, paint);

    // Right Facet
    paint.shader = LinearGradient(
      colors: [const Color(0xFF9775FA), const Color(0xFF7950F2)],
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
    ).createShader(Rect.fromLTWH(0, 0, w, h));
    final rightPath = Path()
      ..moveTo(w * 0.875, h * 0.3)
      ..lineTo(w * 0.7, h * 0.3)
      ..lineTo(w * 0.5, h * 0.1)
      ..close();
    canvas.drawPath(rightPath, paint);

    // Bottom Point (Deepest)
    paint.shader = LinearGradient(
      colors: [const Color(0xFF6366F1), const Color(0xFF4338CA)],
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
    ).createShader(Rect.fromLTWH(0, h * 0.3, w, h * 0.7));
    final bottomPath = Path()
      ..moveTo(w * 0.125, h * 0.4)
      ..lineTo(w * 0.875, h * 0.4)
      ..lineTo(w * 0.5, h * 0.9)
      ..close();
    canvas.drawPath(bottomPath, paint);
    
    // Girdle Center
    paint.color = const Color(0xFF7C3AED);
    final centerPath = Path()
      ..moveTo(w * 0.3, h * 0.3)
      ..lineTo(w * 0.7, h * 0.3)
      ..lineTo(w * 0.875, h * 0.4)
      ..lineTo(w * 0.125, h * 0.4)
      ..close();
    canvas.drawPath(centerPath, paint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

class Beans3DIcon extends StatelessWidget {
  final double size;
  const Beans3DIcon({super.key, this.size = 24});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          colors: [Color(0xFFFDE68A), Color(0xFFF59E0B)],
          center: Alignment.topLeft,
          radius: 0.8,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFF59E0B).withOpacity(0.4),
            blurRadius: size * 0.2,
            offset: Offset(0, size * 0.1),
          ),
        ],
      ),
      child: Icon(
        Icons.circle,
        size: size * 0.6,
        color: Colors.white.withOpacity(0.6),
      ),
    );
  }
}

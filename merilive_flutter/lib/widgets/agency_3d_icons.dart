import 'package:flutter/material.dart';
import 'dart:math' as math;

class Agency3DIcons {
  static Widget hosts() => const _Icon3DWrapper(child: _HostsIcon());
  static Widget withdraw() => const _Icon3DWrapper(child: _WithdrawIcon());
  static Widget ranking() => const _Icon3DWrapper(child: _RankingIcon());
  static Widget helper() => const _Icon3DWrapper(child: _HelperIcon());
  static Widget diamondExchange() => const _Icon3DWrapper(child: _DiamondExchangeIcon());
  static Widget policy() => const _Icon3DWrapper(child: _PolicyIcon());
  static Widget history() => const _Icon3DWrapper(child: _HistoryIcon());
  static Widget smartLink() => const _Icon3DWrapper(child: _SmartLinkIcon());
}

class _Icon3DWrapper extends StatelessWidget {
  final Widget child;
  const _Icon3DWrapper({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Center(child: SizedBox(width: 32, height: 32, child: child)),
    );
  }
}

class _HostsIcon extends StatelessWidget {
  const _HostsIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _HostsPainter(),
    );
  }
}

class _HostsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white;
    final accentPaint = Paint()..color = Colors.white.withOpacity(0.7);
    final plusPaint = Paint()..color = const Color(0xFF22C55E);
    
    // Person back
    canvas.drawCircle(Offset(size.width * 0.35, size.height * 0.35), 4, accentPaint);
    var path = Path()
      ..moveTo(size.width * 0.2, size.height * 0.75)
      ..quadraticBezierTo(size.width * 0.2, size.height * 0.55, size.width * 0.35, size.height * 0.53)
      ..quadraticBezierTo(size.width * 0.5, size.height * 0.55, size.width * 0.5, size.height * 0.75)
      ..close();
    canvas.drawPath(path, accentPaint);

    // Person front
    canvas.drawCircle(Offset(size.width * 0.65, size.height * 0.32), 5, whitePaint);
    path = Path()
      ..moveTo(size.width * 0.45, size.height * 0.78)
      ..quadraticBezierTo(size.width * 0.45, size.height * 0.55, size.width * 0.65, size.height * 0.52)
      ..quadraticBezierTo(size.width * 0.85, size.height * 0.55, size.width * 0.85, size.height * 0.78)
      ..close();
    canvas.drawPath(path, whitePaint);

    // Plus badge
    canvas.drawCircle(Offset(size.width * 0.82, size.height * 0.28), 5, plusPaint);
    final linePaint = Paint()..color = Colors.white..strokeWidth = 1.5..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(size.width * 0.78, size.height * 0.28), Offset(size.width * 0.86, size.height * 0.28), linePaint);
    canvas.drawLine(Offset(size.width * 0.82, size.height * 0.24), Offset(size.width * 0.82, size.height * 0.32), linePaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _WithdrawIcon extends StatelessWidget {
  const _WithdrawIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _WithdrawPainter(),
    );
  }
}

class _WithdrawPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white..style = PaintingStyle.fill;
    
    // Wallet body
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(2, 6, 24, 18), const Radius.circular(3)), paint);
    
    // Flap
    final flapPaint = Paint()..color = Colors.white.withOpacity(0.6);
    canvas.drawPath(
      Path()
        ..moveTo(2, 8)
        ..quadraticBezierTo(2, 6, 6, 6)
        ..lineTo(22, 6)
        ..quadraticBezierTo(26, 6, 26, 8)
        ..lineTo(26, 12)
        ..lineTo(2, 12)
        ..close(),
      flapPaint
    );
    
    // Clasp
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(18, 14, 10, 7), const Radius.circular(2)), Paint()..color = Colors.black.withOpacity(0.15));
    canvas.drawCircle(const Offset(23, 17.5), 2.5, paint);
    
    // Arrow down
    final arrowPaint = Paint()..color = Colors.white..strokeWidth = 2..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
    canvas.drawLine(const Offset(13, 22), const Offset(13, 28), arrowPaint);
    canvas.drawPath(Path()..moveTo(10, 25)..lineTo(13, 28)..lineTo(16, 25), arrowPaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RankingIcon extends StatelessWidget {
  const _RankingIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _RankingPainter(),
    );
  }
}

class _RankingPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white;
    
    // Trophy cup
    final path = Path()
      ..moveTo(8, 4)
      ..lineTo(8, 12)
      ..quadraticBezierTo(8, 18, 16, 20)
      ..quadraticBezierTo(24, 18, 24, 12)
      ..lineTo(24, 4)
      ..close();
    canvas.drawPath(path, whitePaint);
    
    // Handles
    final handlePaint = Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2;
    canvas.drawPath(Path()..moveTo(8, 6)..quadraticBezierTo(2, 6, 2, 11)..quadraticBezierTo(2, 15, 8, 14), handlePaint);
    canvas.drawPath(Path()..moveTo(24, 6)..quadraticBezierTo(30, 6, 30, 11)..quadraticBezierTo(30, 15, 24, 14), handlePaint);
    
    // Base
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(10, 22, 12, 3), const Radius.circular(1)), whitePaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HelperIcon extends StatelessWidget {
  const _HelperIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _HelperPainter(),
    );
  }
}

class _HelperPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2.5..strokeCap = StrokeCap.round;
    
    // Headphone band
    canvas.drawPath(Path()..moveTo(6, 18)..quadraticBezierTo(6, 6, 16, 6)..quadraticBezierTo(26, 6, 26, 18), whitePaint);
    
    // Ear cups
    final fillPaint = Paint()..color = Colors.white;
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(3, 16, 7, 10), const Radius.circular(3)), fillPaint);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(22, 16, 7, 10), const Radius.circular(3)), fillPaint);
    
    // Mic
    canvas.drawPath(Path()..moveTo(6, 22)..quadraticBezierTo(6, 28, 12, 29)..lineTo(14, 29), whitePaint..strokeWidth = 1.5);
    canvas.drawCircle(const Offset(16, 29), 2, fillPaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _DiamondExchangeIcon extends StatelessWidget {
  const _DiamondExchangeIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DiamondExchangePainter(),
    );
  }
}

class _DiamondExchangePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final coinPaint = Paint()..color = Colors.white;
    final coinBackPaint = Paint()..color = Colors.white.withOpacity(0.6);
    
    // Coins
    canvas.drawCircle(const Offset(12, 16), 8, coinBackPaint);
    canvas.drawCircle(const Offset(20, 14), 8, coinPaint);
    
    // Symbol on front coin
    final textPainter = TextPainter(
      text: const TextSpan(text: '\$', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 10, fontWeight: FontWeight.bold)),
      textDirection: TextDirection.ltr,
    )..layout();
    textPainter.paint(canvas, const Offset(17, 9));

    // Exchange arrows
    final arrowPaint = Paint()..color = Colors.white..strokeWidth = 1.5..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
    canvas.drawLine(const Offset(8, 26), const Offset(24, 26), arrowPaint);
    canvas.drawPath(Path()..moveTo(21, 23)..lineTo(24, 26)..lineTo(21, 29), arrowPaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _PolicyIcon extends StatelessWidget {
  const _PolicyIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _PolicyPainter(),
    );
  }
}

class _PolicyPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;
    
    // Shield
    final path = Path()
      ..moveTo(16, 4)
      ..lineTo(26, 10)
      ..lineTo(26, 20)
      ..quadraticBezierTo(26, 28, 16, 32)
      ..quadraticBezierTo(6, 28, 6, 20)
      ..lineTo(6, 10)
      ..close();
    canvas.drawPath(path, paint);
    
    // Checkmark
    final checkPaint = Paint()..color = const Color(0xFF22C55E)..strokeWidth = 2.5..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round..style = PaintingStyle.stroke;
    canvas.drawPath(Path()..moveTo(11, 17)..lineTo(14, 20)..lineTo(21, 13), checkPaint);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HistoryIcon extends StatelessWidget {
  const _HistoryIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _HistoryPainter(),
    );
  }
}

class _HistoryPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white..style = PaintingStyle.fill;
    final strokePaint = Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2;
    
    // Clock body
    canvas.drawCircle(const Offset(16, 16), 12, strokePaint);
    
    // Hands
    canvas.drawLine(const Offset(16, 16), const Offset(16, 10), strokePaint..strokeWidth = 2);
    canvas.drawLine(const Offset(16, 16), const Offset(21, 16), strokePaint..strokeWidth = 1.5);
    
    // Center dot
    canvas.drawCircle(const Offset(16, 16), 2, Paint()..color = const Color(0xFFF59E0B));
    
    // Rewind arrow
    canvas.drawPath(Path()..moveTo(6, 6)..lineTo(6, 12)..lineTo(12, 12), strokePaint..strokeWidth = 2);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SmartLinkIcon extends StatelessWidget {
  const _SmartLinkIcon();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _SmartLinkPainter());
  }
}

class _SmartLinkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white..style = PaintingStyle.fill;
    final accentPaint = Paint()..color = const Color(0xFF6366F1);
    
    // Link chains
    final path = Path()
      ..moveTo(size.width * 0.2, size.height * 0.5)
      ..lineTo(size.width * 0.8, size.height * 0.5);
    canvas.drawPath(path, Paint()..color = Colors.white.withOpacity(0.5)..strokeWidth = 4..style = PaintingStyle.stroke);
    
    // Zap
    final zapPath = Path()
      ..moveTo(size.width * 0.5, size.height * 0.2)
      ..lineTo(size.width * 0.35, size.height * 0.55)
      ..lineTo(size.width * 0.5, size.height * 0.55)
      ..lineTo(size.width * 0.45, size.height * 0.85)
      ..lineTo(size.width * 0.65, size.height * 0.45)
      ..lineTo(size.width * 0.5, size.height * 0.45)
      ..close();
    canvas.drawPath(zapPath, accentPaint);
    canvas.drawPath(zapPath, Paint()..color = Colors.white..strokeWidth = 1.5..style = PaintingStyle.stroke);
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}



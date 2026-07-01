import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/design_tokens.dart';
import '../../branding/branding.dart';
import '../../branding/branding_cubit.dart';

/// Full-screen deep-space background with animated glow orbs.
/// If admin branding provides an image/gif URL, overlay it under the orbs.
/// Video/gradient branding types fall back to the gradient (video support
/// added when we introduce `video_player` in a later phase).
class AuthBackground extends StatefulWidget {
  const AuthBackground({super.key, required this.child});
  final Widget child;

  @override
  State<AuthBackground> createState() => _AuthBackgroundState();
}

class _AuthBackgroundState extends State<AuthBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BrandingCubit, Branding>(
      builder: (context, branding) {
        final hasImage = branding.backgroundUrl.isNotEmpty &&
            (branding.backgroundType == BrandingBgType.image ||
                branding.backgroundType == BrandingBgType.gif);
        return Stack(
          fit: StackFit.expand,
          children: [
            // 1. Base gradient
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: DT.authBgGradient,
                ),
              ),
            ),

            // 2. Admin branding image (if any)
            if (hasImage)
              Positioned.fill(
                child: CachedNetworkImage(
                  imageUrl: branding.backgroundUrl,
                  fit: BoxFit.cover,
                  fadeInDuration: const Duration(milliseconds: 400),
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),

            // 3. Legibility scrim over image
            if (hasImage)
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x66000000), Color(0xAA000000)],
                  ),
                ),
              ),

            // 4. Animated glow orbs
            AnimatedBuilder(
              animation: _ctrl,
              builder: (_, __) {
                final t = _ctrl.value;
                return CustomPaint(
                  size: MediaQuery.sizeOf(context),
                  painter: _OrbPainter(t: t),
                );
              },
            ),

            // 5. Content
            SafeArea(child: widget.child),
          ],
        );
      },
    );
  }
}

class _OrbPainter extends CustomPainter {
  _OrbPainter({required this.t});
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    void orb(Color c, Offset center, double radius) {
      final paint = Paint()
        ..color = c
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 90);
      canvas.drawCircle(center, radius, paint);
    }

    final w = size.width;
    final h = size.height;
    final phase = t * 6.28318;

    orb(
      DT.glowPurple.withOpacity(0.35),
      Offset(w * 0.18 + 20 * (0.5 + 0.5 * _sin(phase)),
          h * 0.22 + 20 * (0.5 + 0.5 * _cos(phase))),
      140,
    );
    orb(
      DT.glowPink.withOpacity(0.28),
      Offset(w * 0.82 + 20 * (0.5 + 0.5 * _cos(phase * 0.8)),
          h * 0.68 + 20 * (0.5 + 0.5 * _sin(phase * 0.9))),
      160,
    );
    orb(
      DT.glowBlue.withOpacity(0.22),
      Offset(w * 0.55 + 30 * (0.5 + 0.5 * _sin(phase * 1.2)),
          h * 0.88 + 20 * (0.5 + 0.5 * _cos(phase * 1.1))),
      180,
    );
  }

  double _sin(double x) => 0.5 * (1 + (2 * x % 6.283 - 3.14) / 3.14);
  double _cos(double x) => _sin(x + 1.57);

  @override
  bool shouldRepaint(_OrbPainter old) => old.t != t;
}

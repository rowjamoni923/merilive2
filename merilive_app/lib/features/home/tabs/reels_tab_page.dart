import 'package:flutter/material.dart';

import '../../../core/theme/design_tokens.dart';

class ReelsTabPage extends StatelessWidget {
  const ReelsTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (r) =>
                  const LinearGradient(colors: DT.tabReels).createShader(r),
              child: const Icon(Icons.play_circle_fill_rounded,
                  size: 64, color: Colors.white),
            ),
            const SizedBox(height: 14),
            const Text(
              'Reels',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Vertical feed lands in Step J',
              style: TextStyle(fontSize: 12, color: DT.navInkMuted),
            ),
          ],
        ),
      ),
    );
  }
}

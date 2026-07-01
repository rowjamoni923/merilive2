import 'package:flutter/material.dart';

import '../../../core/theme/design_tokens.dart';

class PartyTabPage extends StatelessWidget {
  const PartyTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const _TabScaffold(
      icon: Icons.groups_2_rounded,
      title: 'Party rooms',
      subtitle: 'Party discovery lands in Step I',
      accent: DT.tabParty,
    );
  }
}

class _TabScaffold extends StatelessWidget {
  const _TabScaffold({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.accent,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final List<Color> accent;

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
                  LinearGradient(colors: accent).createShader(r),
              child: Icon(icon, size: 64, color: Colors.white),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 12, color: DT.navInkMuted),
            ),
          ],
        ),
      ),
    );
  }
}

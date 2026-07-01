import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/design_tokens.dart';

/// Bottom action sheet triggered by center "+" — Go Live / Create Party /
/// Random Call. Parity with the AnimatePresence menu in `BottomNavigation.tsx`.
///
/// Each button routes to the honest placeholder page for its sector so
/// navigation is verifiable end-to-end today. Full features land when the
/// corresponding sector is built out.
class CreateActionSheet extends StatelessWidget {
  const CreateActionSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: bottomInset + 96, // sit above bottom nav
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ActionButton(
            gradient: DT.actionGoLive,
            icon: Icons.radio_rounded,
            title: 'Go Live',
            subtitle: 'Start a live stream',
            trailingDotPulse: true,
            onTap: () => _go(context, const GoLivePlaceholderRoute()),
          ),
          const SizedBox(height: 12),
          _ActionButton(
            gradient: DT.actionParty,
            icon: Icons.celebration_rounded,
            title: 'Create Party',
            subtitle: 'Audio / video / game room',
            trailingIcon: Icons.groups_2_rounded,
            onTap: () => _go(context, const CreatePartyPlaceholderRoute()),
          ),
          const SizedBox(height: 12),
          _ActionButton(
            gradient: DT.actionMatchCall,
            icon: Icons.phone_in_talk_rounded,
            title: 'Random Call',
            subtitle: 'Random 1-on-1 video',
            trailingDotPulse: true,
            onTap: () => _go(context, const RandomCallPlaceholderRoute()),
          ),
        ],
      ),
    );
  }

  void _go(BuildContext context, PageRouteInfo route) {
    HapticFeedback.selectionClick();
    Navigator.of(context).pop();
    context.router.push(route);
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.gradient,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailingIcon,
    this.trailingDotPulse = false,
  });

  final List<Color> gradient;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final IconData? trailingIcon;
  final bool trailingDotPulse;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(colors: gradient),
            border: Border.all(color: Colors.white.withOpacity(0.2)),
            boxShadow: [
              BoxShadow(
                color: gradient.first.withOpacity(0.5),
                blurRadius: 22,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.85),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailingIcon != null)
                Icon(trailingIcon,
                    color: Colors.white.withOpacity(0.75), size: 18),
              if (trailingDotPulse)
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

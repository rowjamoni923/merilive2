import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';

/// Bottom action sheet triggered by center "+" — Go Live / Create Party /
/// Random Call. Parity with the AnimatePresence menu in `BottomNavigation.tsx`.
///
/// Real navigation targets land in Steps H-J when the corresponding surfaces
/// exist; for now the buttons close the sheet and surface an honest toast so
/// no fake destinations are shown.
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
            onTap: () => _todo(context, 'Go Live'),
          ),
          const SizedBox(height: 12),
          _ActionButton(
            gradient: DT.actionParty,
            icon: Icons.celebration_rounded,
            title: 'Create Party',
            subtitle: 'Audio / video / game room',
            trailingIcon: Icons.groups_2_rounded,
            onTap: () => _todo(context, 'Create Party'),
          ),
          const SizedBox(height: 12),
          _ActionButton(
            gradient: DT.actionMatchCall,
            icon: Icons.phone_in_talk_rounded,
            title: 'Random Call',
            subtitle: 'Random 1-on-1 video',
            trailingDotPulse: true,
            onTap: () => _todo(context, 'Random Call'),
          ),
        ],
      ),
    );
  }

  void _todo(BuildContext context, String label) {
    HapticFeedback.selectionClick();
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1F2937),
        content: Text(
          '$label is landing in the next step',
          style: const TextStyle(color: Colors.white),
        ),
      ));
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

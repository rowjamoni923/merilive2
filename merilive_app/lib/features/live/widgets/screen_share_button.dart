import 'package:flutter/material.dart';

/// Flutter port of `ScreenShareButton.tsx` — host-only toolbar button that
/// toggles LiveKit screen share. Icon + subtle glow when active.
class ScreenShareButton extends StatelessWidget {
  final bool active;
  final bool disabled;
  final VoidCallback onPressed;
  const ScreenShareButton({
    super.key,
    required this.active,
    required this.onPressed,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: active
            ? const LinearGradient(colors: [
                Color(0xFF3B82F6),
                Color(0xFF06B6D4),
              ])
            : null,
        color: active ? null : Colors.black.withOpacity(0.35),
        boxShadow: active
            ? [
                BoxShadow(
                    color: const Color(0xFF3B82F6).withOpacity(0.55),
                    blurRadius: 16,
                    spreadRadius: 1),
              ]
            : null,
      ),
      child: IconButton(
        onPressed: disabled ? null : onPressed,
        icon: Icon(
          active ? Icons.stop_screen_share : Icons.screen_share,
          color: disabled ? Colors.white38 : Colors.white,
          size: 20,
        ),
        tooltip: active ? 'Stop screen share' : 'Screen share',
      ),
    );
  }
}

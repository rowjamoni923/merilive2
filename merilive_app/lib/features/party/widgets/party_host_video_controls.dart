import 'package:flutter/material.dart';

import '../../../core/native/livekit_bridge.dart';

/// G12/G13/G14 — Host-only in-room camera controls for video / game parties.
///
/// Routes through `LiveKitBridge` (native GPUPixel + Camera2 pipeline the
/// host is already publishing on). Safe no-op on non-host / web / iOS.
class PartyHostVideoControls extends StatefulWidget {
  const PartyHostVideoControls({super.key, this.visible = true});
  final bool visible;

  @override
  State<PartyHostVideoControls> createState() => _PartyHostVideoControlsState();
}

class _PartyHostVideoControlsState extends State<PartyHostVideoControls> {
  bool _beauty = false;
  bool _videoOff = false;

  Future<void> _flip() async {
    try {
      await LiveKitBridge.instance.switchCamera();
    } catch (_) {}
  }

  Future<void> _toggleBeauty() async {
    final next = !_beauty;
    setState(() => _beauty = next);
    try {
      await LiveKitBridge.instance.setBeautyEnabled(next);
    } catch (_) {}
  }

  Future<void> _toggleVideoOff() async {
    final next = !_videoOff;
    setState(() => _videoOff = next);
    try {
      await LiveKitBridge.instance.setVideoVisible(!next);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.visible) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _pill(
            icon: Icons.flip_camera_ios_rounded,
            color: Colors.white,
            onTap: _flip,
            tooltip: 'Flip camera',
          ),
          _pill(
            icon: _beauty ? Icons.face_retouching_natural : Icons.face_rounded,
            color: _beauty ? const Color(0xFFEC4899) : Colors.white,
            onTap: _toggleBeauty,
            tooltip: 'Beauty',
          ),
          _pill(
            icon: _videoOff
                ? Icons.videocam_off_rounded
                : Icons.videocam_rounded,
            color: _videoOff ? Colors.redAccent : Colors.white,
            onTap: _toggleVideoOff,
            tooltip: _videoOff ? 'Show camera' : 'Hide camera',
          ),
        ],
      ),
    );
  }

  Widget _pill({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 20,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Icon(icon, color: color, size: 20),
        ),
      ),
    );
  }
}

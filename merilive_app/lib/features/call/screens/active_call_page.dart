import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/private_call_bridge.dart';

/// C8 — Flutter Active Call surface (Chamet/Olamet-style 1-on-1).
///
/// Assumes the caller landed here after a successful `start_private_call` RPC
/// + native LiveKit connect (`PrivateCallBridge.startAsCaller`). This screen
/// owns only the presentation + hangup — billing/reconnect/rating land in C9.
///
/// The native LiveKit renderer is mounted BEHIND Flutter via `attachLocal`,
/// so the Scaffold background is intentionally transparent; only the HUD is
/// drawn by Flutter. Pushed via `Navigator.push` (not auto_route) so we don't
/// require a build_runner regeneration.
class ActiveCallPage extends StatefulWidget {
  const ActiveCallPage({
    super.key,
    required this.bridge,
    required this.hostName,
    this.hostAvatarUrl,
    this.matchSessionId,
  });

  final PrivateCallBridge bridge;
  final String hostName;
  final String? hostAvatarUrl;
  final String? matchSessionId;

  @override
  State<ActiveCallPage> createState() => _ActiveCallPageState();
}

class _ActiveCallPageState extends State<ActiveCallPage> {
  final _stopwatch = Stopwatch()..start();
  Timer? _tick;
  bool _muted = false;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed = _stopwatch.elapsed);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _stopwatch.stop();
    super.dispose();
  }

  Future<void> _hangUp() async {
    HapticFeedback.mediumImpact();
    final duration = _stopwatch.elapsed.inSeconds;
    await widget.bridge.hangUp(reason: 'caller_hangup');
    if (widget.matchSessionId != null) {
      try {
        await Supabase.instance.client.functions
            .invoke('random-call-settle', body: {
          'session_id': widget.matchSessionId,
          'duration_seconds': duration,
          'ended_by': 'caller',
        });
      } catch (_) {}
    }
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  Future<void> _toggleMute() async {
    HapticFeedback.selectionClick();
    setState(() => _muted = !_muted);
    await widget.bridge.setMuted(_muted);
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Native LiveKit SurfaceViewRenderer draws underneath Flutter.
          // The Container below is a subtle dimmer so the HUD reads well.
          IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.45),
                    Colors.transparent,
                    Colors.black.withOpacity(0.55),
                  ],
                  stops: const [0, 0.35, 1],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                _CallHeader(
                  name: widget.hostName,
                  avatarUrl: widget.hostAvatarUrl,
                  elapsed: _fmt(_elapsed),
                ),
                const Spacer(),
                _CallControls(
                  muted: _muted,
                  onMute: _toggleMute,
                  onHangUp: _hangUp,
                ),
                const SizedBox(height: 28),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CallHeader extends StatelessWidget {
  const _CallHeader({
    required this.name,
    required this.avatarUrl,
    required this.elapsed,
  });
  final String name;
  final String? avatarUrl;
  final String elapsed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border:
                  Border.all(color: const Color(0xFF06B6D4), width: 2),
              image: avatarUrl != null
                  ? DecorationImage(
                      image: NetworkImage(avatarUrl!),
                      fit: BoxFit.cover,
                    )
                  : null,
              color: const Color(0xFF1F2937),
            ),
            child: avatarUrl == null
                ? const Icon(Icons.person, color: Colors.white70)
                : null,
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                elapsed,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.8),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const Spacer(),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.45),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withOpacity(0.15)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Icon(Icons.diamond_rounded,
                    color: Color(0xFF06B6D4), size: 14),
                SizedBox(width: 4),
                Text(
                  'HD',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CallControls extends StatelessWidget {
  const _CallControls({
    required this.muted,
    required this.onMute,
    required this.onHangUp,
  });
  final bool muted;
  final VoidCallback onMute;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _Orb(
          icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          background: Colors.white.withOpacity(0.14),
          onTap: onMute,
        ),
        _Orb(
          icon: Icons.call_end_rounded,
          background: const Color(0xFFEF4444),
          size: 72,
          onTap: onHangUp,
        ),
        _Orb(
          icon: Icons.cameraswitch_rounded,
          background: Colors.white.withOpacity(0.14),
          onTap: () {
            // C9 — camera flip via native bridge.
          },
        ),
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({
    required this.icon,
    required this.background,
    required this.onTap,
    this.size = 60,
  });
  final IconData icon;
  final Color background;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: background,
          boxShadow: [
            BoxShadow(
              color: background.withOpacity(0.5),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Icon(icon, color: Colors.white, size: size * 0.42),
      ),
    );
  }
}

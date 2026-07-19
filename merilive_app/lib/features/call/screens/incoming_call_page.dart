import 'dart:async';
import 'dart:ui';

import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';
import '../../../core/notifications/incoming_call_listener.dart';
import '../data/private_call_bridge.dart';
import 'active_call_page.dart';

/// M13 — Full-screen incoming call ringer.
///
/// Chamet/Bigo-class layout, 1:1 parity with `IncomingCallModal.tsx`:
///
///   Layer 0 : caller avatar blurred + scaled as full-screen background
///   Layer 1 : dark vignette + subtle ambient glow
///   Layer 2 : safe-area top — "Incoming Video/Audio Call" label, name,
///             foreground avatar with pulsing ring
///   Layer 3 : bottom thumb-zone — Decline (red) / Accept (green), 72dp,
///             ≥96px bottom safe-area inset, blocks back button
///
/// Side-effects:
///   • Vibrates on mount (waveform 0, 1000, 1000).
///   • Acquires wake-lock so the screen stays on.
///   • On accept → `PrivateCallBridge.acceptIncoming` (RPC + LiveKit
///     receiver-side connect), then replaces route with `/call/active`.
///   • On decline → server `decline_private_call` RPC + pop.
///   • On dispose → releases wake-lock, cancels vibration, notifies
///     `IncomingCallListener.notifyRingResolved` for dedupe.
@RoutePage()
class IncomingCallPage extends StatefulWidget {
  const IncomingCallPage({
    super.key,
    @PathParam('callId') required this.callId,
    @QueryParam('caller') this.callerId,
    @QueryParam('name') this.callerName = 'User',
    @QueryParam('avatar') this.callerAvatar,
    @QueryParam('level') this.callerLevel = 1,
    @QueryParam('type') this.callType = 'video',
    @QueryParam('cpm') this.diamondsPerMinute = 0,
    @QueryParam('auto') this.autoAccept = 0,
  });

  final String callId;
  final String? callerId;
  final String callerName;
  final String? callerAvatar;
  final int callerLevel;
  final String callType;
  final int diamondsPerMinute;
  final int autoAccept;

  @override
  State<IncomingCallPage> createState() => _IncomingCallPageState();
}

class _IncomingCallPageState extends State<IncomingCallPage>
    with SingleTickerProviderStateMixin {
  bool _processing = false;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
    _startRingEffects();
    if (widget.autoAccept == 1) {
      // Native ringer already fired accept; skip UI, jump to accept flow.
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _handleAccept(skipHaptic: true));
    }
  }

  Future<void> _startRingEffects() async {
    try {
      await WakelockPlus.enable();
    } catch (_) {}
    try {
      if (await Vibration.hasVibrator() ?? false) {
        Vibration.vibrate(
          pattern: [0, 1000, 1000, 1000, 1000],
          intensities: [0, 255, 0, 255, 0],
          repeat: 0,
        );
      }
    } catch (_) {}
  }

  Future<void> _stopRingEffects() async {
    try {
      Vibration.cancel();
    } catch (_) {}
    try {
      await WakelockPlus.disable();
    } catch (_) {}
  }

  @override
  void dispose() {
    _pulse.dispose();
    _stopRingEffects();
    IncomingCallListener.instance.notifyRingResolved(widget.callId);
    super.dispose();
  }

  Future<void> _handleAccept({bool skipHaptic = false}) async {
    if (_processing) return;
    setState(() => _processing = true);
    if (!skipHaptic) HapticFeedback.heavyImpact();
    final messenger = ScaffoldMessenger.of(context);
    await _stopRingEffects();

    try {
      // Server accept (returns true/false, matches web contract).
      final ok = await Supabase.instance.client.rpc(
        'accept_private_call',
        params: {'_call_id': widget.callId},
      );
      if (ok != true) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Call is no longer available')),
        );
        if (mounted) context.router.maybePop();
        return;
      }

      // Receiver-side LiveKit connect (warm Camera2 + attach local).
      final bridge = PrivateCallBridge(Supabase.instance.client);
      final ready = await bridge.acceptIncoming(
        callId: widget.callId,
        participantName: 'Host',
      );
      if (!ready) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Failed to join call')),
        );
        if (mounted) context.router.maybePop();
        return;
      }

      if (!mounted) return;
      // Replace ringer with active call surface (imperative — bridge is not
      // URL-serializable, so we push ActiveCallPage directly).
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ActiveCallPage(
            bridge: bridge,
            hostName: widget.callerName,
            hostId: widget.callerId ?? '',
            hostAvatarUrl: widget.callerAvatar,
          ),
        ),
      );

    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Accept failed: $e')));
      if (mounted) context.router.maybePop();
    }
  }

  Future<void> _handleDecline() async {
    if (_processing) return;
    setState(() => _processing = true);
    HapticFeedback.selectionClick();
    await _stopRingEffects();
    try {
      await Supabase.instance.client.rpc(
        'decline_private_call',
        params: {'_call_id': widget.callId, '_reason': 'declined'},
      );
    } catch (_) {
      try {
        await Supabase.instance.client.rpc(
          'end_private_call',
          params: {'_call_id': widget.callId, '_reason': 'declined'},
        );
      } catch (_) {}
    }
    if (mounted) context.router.maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final avatar = (widget.callerAvatar ?? '').trim();
    final hasAvatar = avatar.isNotEmpty;
    final label = widget.callType == 'audio'
        ? 'Incoming Audio Call'
        : 'Incoming Video Call';
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return PopScope(
      canPop: false, // block back button — must accept/decline
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            // Layer 0 — blurred avatar background
            if (hasAvatar)
              ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
                child: Transform.scale(
                  scale: 1.15,
                  child: CachedNetworkImage(
                    imageUrl: avatar,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) =>
                        Container(color: const Color(0xFF0B0B12)),
                  ),
                ),
              )
            else
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1B1030), Color(0xFF0B0B12)],
                  ),
                ),
              ),

            // Layer 1 — dark vignette + brand-tinted top glow
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x80000000),
                    Color(0x00000000),
                    Color(0xB3000000),
                  ],
                  stops: [0.0, 0.45, 1.0],
                ),
              ),
            ),

            // Layer 2 — foreground caller card
            SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  top: 32,
                  bottom: bottomInset + 40,
                  left: 24,
                  right: 24,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.85),
                        fontSize: 13,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 48),
                    Center(child: _AvatarWithPulse(
                      avatar: avatar,
                      name: widget.callerName,
                      pulse: _pulse,
                    )),
                    const SizedBox(height: 22),
                    Text(
                      widget.callerName,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.14),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: Colors.white.withOpacity(0.24)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.workspace_premium_rounded,
                                color: Colors.amberAccent, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              'Lv ${widget.callerLevel}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (widget.diamondsPerMinute > 0) ...[
                              const SizedBox(width: 10),
                              Container(
                                width: 1,
                                height: 12,
                                color: Colors.white.withOpacity(0.3),
                              ),
                              const SizedBox(width: 10),
                              const Icon(Icons.diamond_outlined,
                                  color: Color(0xFF60A5FA), size: 13),
                              const SizedBox(width: 3),
                              Text(
                                '${widget.diamondsPerMinute}/min',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),

                    const Spacer(),

                    // Layer 3 — action row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _CallActionButton(
                          icon: Icons.call_end_rounded,
                          color: const Color(0xFFEF4444),
                          label: 'Decline',
                          onTap: _processing ? null : _handleDecline,
                        ),
                        _CallActionButton(
                          icon: widget.callType == 'audio'
                              ? Icons.call_rounded
                              : Icons.videocam_rounded,
                          color: const Color(0xFF22C55E),
                          label: 'Accept',
                          highlight: true,
                          onTap: _processing ? null : _handleAccept,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarWithPulse extends StatelessWidget {
  const _AvatarWithPulse({
    required this.avatar,
    required this.name,
    required this.pulse,
  });
  final String avatar;
  final String name;
  final AnimationController pulse;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 168,
      height: 168,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AnimatedBuilder(
            animation: pulse,
            builder: (context, _) {
              final t = pulse.value;
              return SizedBox(
                width: 168,
                height: 168,
                child: Stack(
                  alignment: Alignment.center,
                  children: List.generate(3, (i) {
                    final offset = (t + i / 3) % 1.0;
                    final scale = 0.6 + offset * 0.55;
                    final opacity = (1.0 - offset).clamp(0.0, 0.55);
                    return Opacity(
                      opacity: opacity,
                      child: Transform.scale(
                        scale: scale,
                        child: Container(
                          width: 168,
                          height: 168,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Colors.white.withOpacity(0.9),
                              width: 2,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              );
            },
          ),
          Container(
            width: 132,
            height: 132,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.45),
                  blurRadius: 30,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: avatar.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: avatar,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _fallback(name),
                  )
                : _fallback(name),
          ),
        ],
      ),
    );
  }

  Widget _fallback(String n) {
    final letter =
        n.trim().isEmpty ? '?' : n.trim().substring(0, 1).toUpperCase();
    return Container(
      color: const Color(0xFF6D28D9),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 56,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _CallActionButton extends StatelessWidget {
  const _CallActionButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
    this.highlight = false,
  });
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback? onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: color.withOpacity(highlight ? 0.55 : 0.4),
                    blurRadius: highlight ? 32 : 18,
                    spreadRadius: highlight ? 4 : 0,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Icon(icon, color: Colors.white, size: 34),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

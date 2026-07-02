import 'dart:async';
import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';
import '../../call/data/private_call_bridge.dart';
import '../../call/screens/active_call_page.dart';

/// C7 — Match Call (Flutter parity with `src/pages/MatchCall.tsx`).
///
/// Business logic mirrors the web source of truth:
///   • settings row      → `random_call_settings` (id = 1)
///   • online host count → RPC `get_online_global_hosts(p_caller_id, p_limit)`
///   • start match       → edge fn `random-call-enqueue` (mode = "broadcast")
///   • cancel            → edge fn `random-call-cancel`
///   • matched handoff   → Realtime channel `user-<uid>`, event
///                          `random_broadcast_matched`
///
/// Native LiveKit prejoin preview is warmed via `LiveKitBridge.startLocalPreview`
/// so the same Camera2 sensor promotes into the private-call room (zero-gap).
@RoutePage(name: 'RandomCallPlaceholderRoute')
class MatchCallPage extends StatefulWidget {
  const MatchCallPage({super.key});

  @override
  State<MatchCallPage> createState() => _MatchCallPageState();
}

enum _MatchPhase { prep, searching, matched, error }

class _MatchCallPageState extends State<MatchCallPage>
    with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  late final AnimationController _globe = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  _MatchPhase _phase = _MatchPhase.prep;
  Map<String, dynamic>? _settings;
  Map<String, dynamic>? _profile;
  int _hostsCount = 0;
  int _elapsed = 0;
  String? _errorMsg;
  String? _broadcastId;
  RealtimeChannel? _broadcastChannel;
  RealtimeChannel? _queueChannel;
  Timer? _elapsedTimer;
  Timer? _hostsPollTimer;

  String _gender = 'any';
  bool _cameraPreview = true;
  bool _previewStarted = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      final s = await _supabase
          .from('random_call_settings')
          .select()
          .eq('id', 1)
          .maybeSingle();
      final uid = _supabase.auth.currentUser?.id;
      Map<String, dynamic>? p;
      if (uid != null) {
        p = await _supabase
            .from('profiles')
            .select(
                'id, coins, diamonds, vip_tier, current_vip_tier_id, gender')
            .eq('id', uid)
            .maybeSingle();
      }
      if (!mounted) return;
      setState(() {
        _settings = s;
        _profile = p;
      });
      await _refreshHostsCount();
      _hostsPollTimer = Timer.periodic(
        const Duration(seconds: 10),
        (_) => _refreshHostsCount(),
      );
      // Warm camera preview so the Camera2 sensor is already open when the
      // match connects — matches web behaviour on the prep screen.
      unawaited(_ensurePreview());
    } catch (_) {
      /* silent — surfaced via disabled Start button */
    }
  }

  Future<void> _ensurePreview() async {
    if (_previewStarted || !_cameraPreview) return;
    try {
      await LiveKitBridge.instance.startLocalPreview();
      _previewStarted = true;
    } catch (_) {/* preview optional */}
  }

  Future<void> _refreshHostsCount() async {
    try {
      final uid = _supabase.auth.currentUser?.id;
      if (uid == null) return;
      final res = await _supabase.rpc(
        'get_online_global_hosts',
        params: {'p_caller_id': uid, 'p_limit': 1000},
      );
      if (!mounted) return;
      final list = (res as List?) ?? const [];
      setState(() => _hostsCount = list.length);
    } catch (_) {/* ignore */}
  }

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    _hostsPollTimer?.cancel();
    if (_broadcastChannel != null) {
      _supabase.removeChannel(_broadcastChannel!);
    }
    _globe.dispose();
    if (_previewStarted) {
      LiveKitBridge.instance.stopLocalPreview();
    }
    super.dispose();
  }

  double get _rate {
    final n = _settings?['host_max_rate_coins_per_min'] ??
        _settings?['default_host_rate_coins_per_min'];
    return (n is num) ? n.toDouble() : 0;
  }

  double get _preauthMinutes {
    final n = _settings?['preauth_minutes_hold'];
    return (n is num) ? n.toDouble() : 2;
  }

  double get _balance {
    final c = (_profile?['coins'] as num?)?.toDouble() ?? 0;
    final d = (_profile?['diamonds'] as num?)?.toDouble() ?? 0;
    return math.max(c, d);
  }

  double get _requiredBalance => _rate * _preauthMinutes;

  Future<void> _startSearch() async {
    if (_settings == null) return;
    if (_requiredBalance > 0 && _balance < _requiredBalance) {
      _snack('Not enough coins. Please recharge.');
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() {
      _phase = _MatchPhase.searching;
      _elapsed = 0;
      _errorMsg = null;
    });
    _elapsedTimer?.cancel();
    _elapsedTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => mounted ? setState(() => _elapsed += 1) : null,
    );

    try {
      final res = await _supabase.functions.invoke(
        'random-call-enqueue',
        body: {
          'mode': 'broadcast',
          'preferred_langs': const <String>[],
          'preferred_country': null,
          'preferred_host_gender': _gender,
        },
      );
      final data = res.data as Map?;
      final status = data?['status'] as String?;
      final err = data?['error'] as String?;

      if (err != null) {
        _handleError(err, data);
        return;
      }
      if (status == 'matched' || status == 'reconnected') {
        await _onMatched(
          sessionId: data!['session_id'] as String,
          hostId: data['host_id'] as String,
        );
        return;
      }
      if (status == 'broadcasting') {
        final bid = data!['broadcast_id'] as String;
        final ringTimeout =
            (data['ring_timeout_seconds'] as num?)?.toInt() ?? 20;
        _broadcastId = bid;
        final uid = _supabase.auth.currentUser?.id;
        if (uid == null) throw Exception('not_authenticated');

        final ch = _supabase.channel('user-$uid');
        ch.onBroadcast(
          event: 'random_broadcast_matched',
          callback: (payload) async {
            final p = payload;
            if (p['broadcast_id'] != bid) return;
            await _onMatched(
              sessionId: p['session_id'] as String,
              hostId: p['host_id'] as String,
            );
          },
        );
        ch.subscribe();
        _broadcastChannel = ch;

        Future.delayed(Duration(seconds: ringTimeout + 1), () async {
          if (!mounted || _broadcastId != bid) return;
          await _cancelBroadcast(bid);
          setState(() {
            _phase = _MatchPhase.error;
            _errorMsg = 'No host picked up. Please try again.';
          });
        });
        return;
      }
      throw Exception(err ?? 'unknown_response');
    } catch (e) {
      _handleError(e.toString(), null);
    }
  }

  Future<void> _cancelBroadcast(String bid) async {
    try {
      await _supabase.functions
          .invoke('random-call-cancel', body: {'broadcast_id': bid});
    } catch (_) {}
    if (_broadcastChannel != null) {
      _supabase.removeChannel(_broadcastChannel!);
      _broadcastChannel = null;
    }
    _broadcastId = null;
  }

  void _handleError(String code, Map? payload) {
    _elapsedTimer?.cancel();
    const friendly = {
      'insufficient_coins': 'Not enough coins. Please recharge.',
      'skip_cooldown': "You're skipping too fast. Try again shortly.",
      'daily_skip_limit_reached': 'Daily skip limit reached.',
      'feature_disabled': 'Random Call is temporarily disabled by admin.',
      'unauthorized': 'Please sign in again to continue.',
    };
    final msg = friendly[code] ?? 'Something went wrong. Please try again.';
    if (!mounted) return;
    setState(() {
      _phase = _MatchPhase.error;
      _errorMsg = msg;
    });
  }

  Future<void> _onMatched({
    required String sessionId,
    required String hostId,
  }) async {
    _elapsedTimer?.cancel();
    if (_broadcastChannel != null) {
      _supabase.removeChannel(_broadcastChannel!);
      _broadcastChannel = null;
    }
    _broadcastId = null;
    if (!mounted) return;
    setState(() => _phase = _MatchPhase.matched);

    // C8 — server-authoritative dial + native LiveKit connect. We reuse the
    // warmed prejoin camera by leaving the native preview alive; the plugin
    // promotes it into the new call room on `connect(publishVideo:true)`.
    _previewStarted = false; // ownership handed to PrivateCallBridge
    Map<String, dynamic>? hostProfile;
    try {
      hostProfile = await _supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', hostId)
          .maybeSingle();
    } catch (_) {}

    final bridge = PrivateCallBridge(_supabase);
    Map<String, dynamic>? result;
    try {
      result = await bridge.startAsCaller(
        hostId: hostId,
        participantName: _supabase.auth.currentUser?.id ?? 'caller',
      );
    } catch (e) {
      _handleError('internal_error', {'message': '$e'});
      return;
    }
    if (result == null || result['success'] == false) {
      final code = (result?['error'] as String?) ?? 'internal_error';
      _handleError(code, result);
      return;
    }

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => ActiveCallPage(
          bridge: bridge,
          hostId: hostId,
          hostName: (hostProfile?['username'] as String?) ?? 'Host',
          hostAvatarUrl: hostProfile?['avatar_url'] as String?,
          matchSessionId: sessionId,
        ),
      ),
    );
    if (!mounted) return;
    // Returned from call → reset to prep.
    setState(() {
      _phase = _MatchPhase.prep;
      _elapsed = 0;
    });
  }

  Future<void> _cancelSearch() async {
    _elapsedTimer?.cancel();
    if (_broadcastId != null) {
      await _cancelBroadcast(_broadcastId!);
    }
    if (!mounted) return;
    setState(() {
      _phase = _MatchPhase.prep;
      _elapsed = 0;
    });
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF04070F),
      body: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedBuilder(
            animation: _globe,
            builder: (_, __) => CustomPaint(
              painter: _GlobePainter(_globe.value),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                _TopBar(
                  onBack: () async {
                    if (_broadcastId != null) {
                      await _cancelBroadcast(_broadcastId!);
                    }
                    if (!mounted) return;
                    context.router.maybePop();
                  },
                ),
                const Spacer(),
                _StatusOrb(
                  phase: _phase,
                  hostsCount: _hostsCount,
                  elapsed: _elapsed,
                ),
                const SizedBox(height: 28),
                _RateChip(
                  rate: _rate,
                  hold: _requiredBalance,
                  balance: _balance,
                ),
                const Spacer(),
                _Filters(
                  gender: _gender,
                  disabled: _phase != _MatchPhase.prep,
                  onGender: (g) => setState(() => _gender = g),
                ),
                const SizedBox(height: 20),
                _ActionArea(
                  phase: _phase,
                  errorMsg: _errorMsg,
                  onStart: _startSearch,
                  onCancel: _cancelSearch,
                  onRetry: () => setState(() {
                    _phase = _MatchPhase.prep;
                    _errorMsg = null;
                  }),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation widgets — private to this file to keep the sector self-contained
// ─────────────────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.chevron_left_rounded,
                color: Colors.white, size: 30),
          ),
          const Spacer(),
          const Text(
            'Match Call',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
          const Spacer(),
          const SizedBox(width: 48),
        ],
      ),
    );
  }
}

class _StatusOrb extends StatelessWidget {
  const _StatusOrb({
    required this.phase,
    required this.hostsCount,
    required this.elapsed,
  });
  final _MatchPhase phase;
  final int hostsCount;
  final int elapsed;

  @override
  Widget build(BuildContext context) {
    final title = switch (phase) {
      _MatchPhase.prep => 'Ready to match',
      _MatchPhase.searching => 'Searching worldwide…',
      _MatchPhase.matched => 'Matched!',
      _MatchPhase.error => 'No match',
    };
    final sub = switch (phase) {
      _MatchPhase.searching => '${elapsed}s · ringing $hostsCount host${hostsCount == 1 ? '' : 's'}',
      _MatchPhase.prep => '$hostsCount host${hostsCount == 1 ? '' : 's'} online now',
      _MatchPhase.matched => 'Opening call…',
      _MatchPhase.error => 'Tap retry to keep searching',
    };
    return Column(
      children: [
        Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(colors: [
              Color(0xFF3B82F6),
              Color(0xFF06B6D4),
              Color(0xFF0B1220),
            ]),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF3B82F6).withOpacity(0.55),
                blurRadius: 60,
                spreadRadius: 4,
              ),
            ],
          ),
          child: const Icon(Icons.public_rounded,
              color: Colors.white, size: 92),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          sub,
          style: TextStyle(
            color: Colors.white.withOpacity(0.72),
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _RateChip extends StatelessWidget {
  const _RateChip({
    required this.rate,
    required this.hold,
    required this.balance,
  });
  final double rate;
  final double hold;
  final double balance;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.diamond_rounded,
              color: Color(0xFF06B6D4), size: 18),
          const SizedBox(width: 8),
          Text(
            '${rate.toStringAsFixed(0)}/min  ·  hold ${hold.toStringAsFixed(0)}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 12),
          Container(width: 1, height: 14, color: Colors.white24),
          const SizedBox(width: 12),
          Text(
            'You: ${balance.toStringAsFixed(0)}',
            style: TextStyle(
              color: Colors.white.withOpacity(0.7),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.gender,
    required this.disabled,
    required this.onGender,
  });
  final String gender;
  final bool disabled;
  final ValueChanged<String> onGender;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final g in const ['any', 'female', 'male'])
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: _GenderPill(
                label: switch (g) {
                  'female' => 'Female',
                  'male' => 'Male',
                  _ => 'Any',
                },
                active: gender == g,
                disabled: disabled,
                onTap: () => onGender(g),
              ),
            ),
        ],
      ),
    );
  }
}

class _GenderPill extends StatelessWidget {
  const _GenderPill({
    required this.label,
    required this.active,
    required this.disabled,
    required this.onTap,
  });
  final String label;
  final bool active;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          decoration: BoxDecoration(
            gradient: active
                ? const LinearGradient(colors: [
                    Color(0xFF06B6D4),
                    Color(0xFF3B82F6),
                  ])
                : null,
            color: active ? null : Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? Colors.transparent : Colors.white.withOpacity(0.14),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? Colors.white : Colors.white.withOpacity(0.85),
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionArea extends StatelessWidget {
  const _ActionArea({
    required this.phase,
    required this.errorMsg,
    required this.onStart,
    required this.onCancel,
    required this.onRetry,
  });
  final _MatchPhase phase;
  final String? errorMsg;
  final VoidCallback onStart;
  final VoidCallback onCancel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    switch (phase) {
      case _MatchPhase.prep:
        return _BigButton(label: 'Start Match', onTap: onStart);
      case _MatchPhase.searching:
        return _BigButton(
          label: 'Cancel',
          onTap: onCancel,
          gradient: const [Color(0xFF64748B), Color(0xFF334155)],
        );
      case _MatchPhase.matched:
        return const _BigButton(
          label: 'Connecting…',
          onTap: null,
          gradient: [Color(0xFF10B981), Color(0xFF059669)],
        );
      case _MatchPhase.error:
        return Column(
          children: [
            if (errorMsg != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 24, right: 24),
                child: Text(
                  errorMsg!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.75),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            _BigButton(label: 'Try Again', onTap: onRetry),
          ],
        );
    }
  }
}

class _BigButton extends StatelessWidget {
  const _BigButton({
    required this.label,
    required this.onTap,
    this.gradient = const [Color(0xFF06B6D4), Color(0xFF3B82F6)],
  });
  final String label;
  final VoidCallback? onTap;
  final List<Color> gradient;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: gradient),
            borderRadius: BorderRadius.circular(28),
            boxShadow: [
              BoxShadow(
                color: gradient.first.withOpacity(0.45),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
            ),
          ),
        ),
      ),
    );
  }
}

class _GlobePainter extends CustomPainter {
  _GlobePainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.42);
    // background wash
    final bg = Paint()
      ..shader = RadialGradient(
        colors: [
          const Color(0xFF0B1220),
          const Color(0xFF04070F),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: size.width));
    canvas.drawRect(Offset.zero & size, bg);

    // rotating orbit rings
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = const Color(0xFF3B82F6).withOpacity(0.25);
    for (var i = 0; i < 4; i++) {
      final r = 110.0 + i * 40;
      canvas.drawCircle(center, r, ringPaint);
    }

    // orbiting dots
    final dotPaint = Paint()..color = const Color(0xFF06B6D4);
    for (var i = 0; i < 12; i++) {
      final ring = i % 4;
      final r = 110.0 + ring * 40;
      final speed = 1.0 + ring * 0.4;
      final theta = t * 2 * math.pi * speed + i * (math.pi / 6);
      final p = Offset(
        center.dx + r * math.cos(theta),
        center.dy + r * math.sin(theta) * 0.55,
      );
      dotPaint.color = Color.lerp(const Color(0xFF06B6D4),
              const Color(0xFF3B82F6), (i % 4) / 3)!
          .withOpacity(0.9);
      canvas.drawCircle(p, 3 + (i % 3), dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _GlobePainter old) => old.t != t;
}

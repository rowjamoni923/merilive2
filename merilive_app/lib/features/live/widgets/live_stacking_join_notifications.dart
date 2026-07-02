// Bigo/Chamet parity — stacking join notifications.
//
// Flutter port of `src/components/live/StackingJoinNotifications.tsx`.
// Same tier palette, same MAX_VISIBLE=5, same DISMISS_MS=3200.
// Use [LiveJoinNotificationsController] to feed the widget from realtime
// PARTICIPANT_JOINED events — one call per join.

import 'dart:async';
import 'package:flutter/material.dart';

class LiveJoinNotification {
  LiveJoinNotification({
    required this.id,
    required this.userId,
    required this.userName,
    required this.userLevel,
    this.userAvatar,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  final String id;
  final String userId;
  final String userName;
  final String? userAvatar;
  final int userLevel;
  final DateTime timestamp;
}

class _Tier {
  const _Tier({
    required this.gradient,
    required this.border,
    required this.glow,
    required this.icon,
    required this.badgeTextColor,
    required this.premium,
  });
  final List<Color> gradient;
  final Color border;
  final Color glow;
  final String icon;
  final Color badgeTextColor;
  final bool premium;
}

_Tier _tierFor(int level) {
  if (level >= 50) {
    return _Tier(
      gradient: const [Color(0xE9FBBF24), Color(0xE0F59E0B), Color(0xD9EA580C)],
      border: const Color(0xB3FDE047),
      glow: const Color(0x99FBBF24),
      icon: '👑',
      badgeTextColor: const Color(0xFF78350F),
      premium: true,
    );
  }
  if (level >= 30) {
    return _Tier(
      gradient: const [Color(0xE0A855F7), Color(0xD1EC4899), Color(0xC7F43F5E)],
      border: const Color(0x99E879F9),
      glow: const Color(0x80A855F7),
      icon: '💎',
      badgeTextColor: Colors.white,
      premium: true,
    );
  }
  if (level >= 20) {
    return _Tier(
      gradient: const [Color(0xD922D3EE), Color(0xD13B82F6), Color(0xC76366F1)],
      border: const Color(0x8C7DD3FC),
      glow: const Color(0x733B82F6),
      icon: '⭐',
      badgeTextColor: Colors.white,
      premium: false,
    );
  }
  if (level >= 10) {
    return _Tier(
      gradient: const [Color(0xD934D399), Color(0xD110B981), Color(0xC714B8A6)],
      border: const Color(0x8C6EE7B7),
      glow: const Color(0x6610B981),
      icon: '✨',
      badgeTextColor: Colors.white,
      premium: false,
    );
  }
  return _Tier(
    gradient: const [Color(0xD1647488), Color(0xC7475569), Color(0xBF334155)],
    border: const Color(0x6694A3B8),
    glow: const Color(0x4D94A3B8),
    icon: '✨',
    badgeTextColor: Colors.white,
    premium: false,
  );
}

/// Controller: owns the FIFO list, ticks every 300ms to auto-dismiss.
class LiveJoinNotificationsController extends ChangeNotifier {
  static const int maxVisible = 5;
  static const Duration dismissAfter = Duration(milliseconds: 3200);

  final List<LiveJoinNotification> _items = [];
  Timer? _sweep;

  List<LiveJoinNotification> get items => List.unmodifiable(_items);

  void add({
    required String userId,
    required String userName,
    required int userLevel,
    String? userAvatar,
  }) {
    final n = LiveJoinNotification(
      id: 'join_${DateTime.now().microsecondsSinceEpoch}_$userId',
      userId: userId,
      userName: userName,
      userLevel: userLevel,
      userAvatar: userAvatar,
    );
    _items.add(n);
    if (_items.length > maxVisible) {
      _items.removeRange(0, _items.length - maxVisible);
    }
    _ensureSweep();
    notifyListeners();
  }

  void clear() {
    _items.clear();
    _sweep?.cancel();
    _sweep = null;
    notifyListeners();
  }

  void _ensureSweep() {
    _sweep ??= Timer.periodic(const Duration(milliseconds: 300), (_) {
      final now = DateTime.now();
      final before = _items.length;
      _items.removeWhere((n) => now.difference(n.timestamp) >= dismissAfter);
      if (_items.isEmpty) {
        _sweep?.cancel();
        _sweep = null;
      }
      if (_items.length != before) notifyListeners();
    });
  }

  @override
  void dispose() {
    _sweep?.cancel();
    super.dispose();
  }
}

class LiveStackingJoinNotifications extends StatelessWidget {
  const LiveStackingJoinNotifications({super.key, required this.controller});

  final LiveJoinNotificationsController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final items = controller.items;
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final n in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _JoinNotificationChip(
                  key: ValueKey(n.id),
                  notification: n,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _JoinNotificationChip extends StatefulWidget {
  const _JoinNotificationChip({super.key, required this.notification});

  final LiveJoinNotification notification;

  @override
  State<_JoinNotificationChip> createState() => _JoinNotificationChipState();
}

class _JoinNotificationChipState extends State<_JoinNotificationChip>
    with TickerProviderStateMixin {
  late final AnimationController _enter;
  late final AnimationController _shine;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    )..forward();
    _shine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat();
  }

  @override
  void dispose() {
    _enter.dispose();
    _shine.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tier = _tierFor(widget.notification.userLevel);
    final slide = Tween<Offset>(begin: const Offset(-1.2, 0), end: Offset.zero)
        .chain(CurveTween(curve: Curves.easeOutBack))
        .animate(_enter);
    final fade = Tween<double>(begin: 0, end: 1).animate(_enter);

    return FadeTransition(
      opacity: fade,
      child: SlideTransition(
        position: slide,
        child: Container(
          padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: tier.gradient,
            ),
            border: Border.all(color: tier.border),
            boxShadow: [
              BoxShadow(color: tier.glow, blurRadius: 16, offset: const Offset(0, 6)),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Stack(
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Avatar
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withOpacity(0.7),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(color: tier.glow, blurRadius: 8),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: widget.notification.userAvatar != null &&
                              widget.notification.userAvatar!.isNotEmpty
                          ? Image.network(
                              widget.notification.userAvatar!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _AvatarFallback(
                                name: widget.notification.userName,
                              ),
                            )
                          : _AvatarFallback(name: widget.notification.userName),
                    ),
                    const SizedBox(width: 6),
                    // Level badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.22),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(tier.icon, style: const TextStyle(fontSize: 9)),
                          const SizedBox(width: 2),
                          Text(
                            'Lv.${widget.notification.userLevel}',
                            style: TextStyle(
                              color: tier.badgeTextColor,
                              fontSize: 8,
                              fontWeight: FontWeight.w900,
                              height: 1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 96),
                      child: Text(
                        widget.notification.userName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          shadows: [Shadow(color: Colors.black45, blurRadius: 4)],
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Text(
                      'joined',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                if (tier.premium)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: AnimatedBuilder(
                        animation: _shine,
                        builder: (context, _) {
                          final t = _shine.value;
                          return FractionalTranslation(
                            translation: Offset(-1.1 + t * 2.3, 0),
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Colors.transparent,
                                    Colors.white.withOpacity(0.32),
                                    Colors.transparent,
                                  ],
                                  stops: const [0.35, 0.5, 0.65],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final letter = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return Container(
      color: const Color(0xFF64748B),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
    );
  }
}

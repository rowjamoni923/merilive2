import 'package:flutter/material.dart';

/// Flutter port of `RoomEntranceNotification.tsx` — small centered banner
/// shown once when local viewer joins a stream. Displays room name + host
/// name + level chip, auto-dismiss in 2.4s with fade.
class RoomEntranceNotification extends StatefulWidget {
  final String roomName;
  final String hostName;
  final int hostLevel;
  final String? hostAvatarUrl;
  const RoomEntranceNotification({
    super.key,
    required this.roomName,
    required this.hostName,
    required this.hostLevel,
    this.hostAvatarUrl,
  });

  static void show(BuildContext context,
      {required String roomName,
      required String hostName,
      required int hostLevel,
      String? hostAvatarUrl}) {
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => RoomEntranceNotification(
        roomName: roomName,
        hostName: hostName,
        hostLevel: hostLevel,
        hostAvatarUrl: hostAvatarUrl,
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(milliseconds: 2600), () {
      try {
        entry.remove();
      } catch (_) {}
    });
  }

  @override
  State<RoomEntranceNotification> createState() =>
      _RoomEntranceNotificationState();
}

class _RoomEntranceNotificationState extends State<RoomEntranceNotification>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2600))
      ..forward();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ac,
      builder: (_, __) {
        final t = _ac.value;
        final o = t < 0.08
            ? t / 0.08
            : (t > 0.9 ? (1 - (t - 0.9) / 0.1) : 1.0);
        final dy = t < 0.08 ? (1 - (t / 0.08)) * -12 : 0.0;
        return Positioned(
          top: MediaQuery.of(context).padding.top + 62,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Opacity(
                opacity: o.clamp(0, 1),
                child: Transform.translate(
                  offset: Offset(0, dy),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [
                        Color(0xFF3B82F6),
                        Color(0xFF8B5CF6),
                      ]),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withOpacity(0.35),
                            blurRadius: 20,
                            offset: const Offset(0, 8)),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: Colors.white24,
                          backgroundImage: (widget.hostAvatarUrl != null &&
                                  widget.hostAvatarUrl!.isNotEmpty)
                              ? NetworkImage(widget.hostAvatarUrl!)
                              : null,
                        ),
                        const SizedBox(width: 8),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 180),
                          child: RichText(
                            overflow: TextOverflow.ellipsis,
                            text: TextSpan(
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  height: 1.2),
                              children: [
                                const TextSpan(
                                    text: 'Welcome to ',
                                    style: TextStyle(color: Colors.white70)),
                                TextSpan(
                                    text: widget.roomName,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

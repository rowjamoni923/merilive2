import 'package:flutter/material.dart';

import '../data/party_room_models.dart';

/// A8 — Party chat overlay with 1:1 web parity vs `ChametStyleChatPanel`:
/// differentiated system / join / gift / text bubbles, fade masks and
/// reverse auto-scroll (newest at the bottom).
class PartyChatOverlay extends StatelessWidget {
  const PartyChatOverlay({
    super.key,
    required this.messages,
    required this.hostId,
    required this.currentUserId,
  });

  final List<PartyChatMessage> messages;
  final String? hostId;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return Center(
        child: Text('Say hi 👋',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
      );
    }
    return Stack(
      children: [
        ListView.builder(
          reverse: true,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          itemCount: messages.length,
          itemBuilder: (_, i) {
            final m = messages[messages.length - 1 - i];
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _MessageBubble(
                msg: m,
                isHost: hostId != null && m.userId == hostId,
                isSelf: currentUserId != null && m.userId == currentUserId,
              ),
            );
          },
        ),
        // Top gradient fade — same feel as web
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: 24,
          child: IgnorePointer(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xB3000000), Color(0x00000000)],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.msg,
    required this.isHost,
    required this.isSelf,
  });

  final PartyChatMessage msg;
  final bool isHost;
  final bool isSelf;

  Color _nameColor() {
    if (isHost) return const Color(0xFFFCD34D); // amber-300
    if (msg.userLevel >= 30) return const Color(0xFF67E8F9); // cyan-300
    if (msg.userLevel >= 15) return const Color(0xFFF9A8D4); // pink-300
    return const Color(0xFFDDD6FE); // purple-200
  }

  List<Color> _levelGradient() {
    final l = msg.userLevel;
    if (l >= 50) return const [Color(0xFFF43F5E), Color(0xFFEC4899)];
    if (l >= 40) return const [Color(0xFFF97316), Color(0xFFEF4444)];
    if (l >= 30) return const [Color(0xFFEAB308), Color(0xFFF59E0B)];
    if (l >= 20) return const [Color(0xFF10B981), Color(0xFF14B8A6)];
    if (l >= 10) return const [Color(0xFF3B82F6), Color(0xFF6366F1)];
    return const [Color(0xFF64748B), Color(0xFF475569)];
  }

  Widget _levelBadge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: _levelGradient()),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          '✦${msg.userLevel}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w900,
            height: 1,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final type = msg.messageType;

    // System notice
    if (type == 'system') {
      return Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0x1FA855F7),
            border: Border.all(color: const Color(0x2EA855F7)),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            msg.content,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xD9DDD6FE), fontSize: 11),
          ),
        ),
      );
    }

    // Join / leave
    if (type == 'join' || type == 'leave') {
      final isJoin = type == 'join';
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isJoin
                ? const [Color(0x2E22C55E), Color(0x1410B981)]
                : const [Color(0x2E64748B), Color(0x14475569)],
          ),
          border: Border.all(
            color: isJoin ? const Color(0x384ADE80) : const Color(0x3894A3B8),
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _levelBadge(),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                msg.displayName ?? 'User',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: isJoin
                      ? const Color(0xFF6EE7B7)
                      : const Color(0xFFCBD5E1),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Text(
              isJoin ? 'joined 🎉' : 'left',
              style: TextStyle(
                color: (isJoin
                        ? const Color(0xFFA7F3D0)
                        : const Color(0xFFCBD5E1))
                    .withValues(alpha: 0.85),
                fontSize: 11,
              ),
            ),
          ],
        ),
      );
    }

    // Gift
    if (type == 'gift') {
      final gd = msg.giftData ?? const {};
      final giftName = (gd['gift_name'] ?? gd['name'] ?? 'Gift').toString();
      final qty = (gd['quantity'] ?? gd['count'] ?? 1).toString();
      final iconUrl = (gd['icon_url'] ?? gd['media_url'])?.toString();
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [
            Color(0x47EC4899),
            Color(0x2EA855F7),
          ]),
          border: Border.all(color: const Color(0x59EC4899)),
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(color: Color(0x2EEC4899), blurRadius: 16, offset: Offset(0, 4)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _levelBadge(),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                msg.displayName ?? 'User',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _nameColor(),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 6),
            const Text('sent',
                style: TextStyle(color: Color(0xF2FFFFFF), fontSize: 12)),
            const SizedBox(width: 4),
            if (iconUrl != null && iconUrl.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Image.network(
                  iconUrl,
                  width: 20,
                  height: 20,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            Text(
              '$giftName ×$qty',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    // Text
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isSelf
            ? const Color(0x3D8B5CF6)
            : Colors.black.withValues(alpha: 0.38),
        border: Border.all(
          color: isSelf ? const Color(0x66A855F7) : Colors.white12,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(fontSize: 12.5, color: Colors.white),
          children: [
            WidgetSpan(
              alignment: PlaceholderAlignment.middle,
              child: Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _levelBadge(),
              ),
            ),
            TextSpan(
              text: '${msg.displayName ?? "User"}: ',
              style: TextStyle(
                color: _nameColor(),
                fontWeight: FontWeight.w700,
              ),
            ),
            TextSpan(text: msg.content),
          ],
        ),
      ),
    );
  }
}

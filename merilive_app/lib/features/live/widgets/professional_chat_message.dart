import 'package:flutter/material.dart';

/// Flutter port of `ProfessionalChatMessage.tsx` — single row inside live chat
/// overlay. Level pill, VIP/verified badges, optional role tag (Host/Mod),
/// gradient username by level, and message body. Tap avatar/name to open
/// profile card (caller-supplied).
class ProfessionalChatMessageData {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int level;
  final String message;
  final bool isVerified;
  final bool isVip;
  final bool isHost;
  final bool isModerator;
  final bool isSystem;

  const ProfessionalChatMessageData({
    required this.userId,
    required this.name,
    required this.message,
    this.avatarUrl,
    this.level = 1,
    this.isVerified = false,
    this.isVip = false,
    this.isHost = false,
    this.isModerator = false,
    this.isSystem = false,
  });
}

class ProfessionalChatMessage extends StatelessWidget {
  final ProfessionalChatMessageData data;
  final VoidCallback? onTapUser;
  const ProfessionalChatMessage({super.key, required this.data, this.onTapUser});

  List<Color> _levelGrad() {
    final l = data.level;
    if (l >= 60) {
      return const [Color(0xFFF59E0B), Color(0xFFEF4444)];
    }
    if (l >= 40) {
      return const [Color(0xFF8B5CF6), Color(0xFFEC4899)];
    }
    if (l >= 20) return const [Color(0xFF3B82F6), Color(0xFF06B6D4)];
    return const [Color(0xFF64748B), Color(0xFF475569)];
  }

  @override
  Widget build(BuildContext context) {
    if (data.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 8),
        child: Center(
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(data.message,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.7),
                    fontSize: 11)),
          ),
        ),
      );
    }
    final grad = _levelGrad();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.32),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GestureDetector(
              onTap: onTapUser,
              child: Container(
                padding: const EdgeInsets.all(1.5),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: grad),
                ),
                child: CircleAvatar(
                  radius: 12,
                  backgroundColor: const Color(0xFF1E293B),
                  backgroundImage:
                      (data.avatarUrl != null && data.avatarUrl!.isNotEmpty)
                          ? NetworkImage(data.avatarUrl!)
                          : null,
                  child: (data.avatarUrl == null || data.avatarUrl!.isEmpty)
                      ? Text(
                          data.name.isNotEmpty
                              ? data.name.substring(0, 1).toUpperCase()
                              : '?',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700))
                      : null,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: RichText(
                text: TextSpan(
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.35),
                  children: [
                    WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 1),
                        margin: const EdgeInsets.only(right: 4),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: grad),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text('Lv${data.level}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w800)),
                      ),
                    ),
                    if (data.isHost)
                      const WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: _RoleChip(
                            label: 'HOST', color: Color(0xFFEC4899)),
                      ),
                    if (data.isModerator)
                      const WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: _RoleChip(
                            label: 'MOD', color: Color(0xFF3B82F6)),
                      ),
                    if (data.isVip)
                      const WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: _RoleChip(
                            label: 'VIP', color: Color(0xFFF59E0B)),
                      ),
                    TextSpan(
                      text: data.name,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: Color(0xFFFDE68A)),
                      recognizer: null,
                    ),
                    if (data.isVerified)
                      const WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Padding(
                          padding: EdgeInsets.only(left: 2),
                          child: Icon(Icons.verified,
                              color: Color(0xFF3B82F6), size: 12),
                        ),
                      ),
                    const TextSpan(text: '  '),
                    TextSpan(text: data.message),
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

class _RoleChip extends StatelessWidget {
  final String label;
  final Color color;
  const _RoleChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label,
          style: const TextStyle(
              color: Colors.white,
              fontSize: 8,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3)),
    );
  }
}

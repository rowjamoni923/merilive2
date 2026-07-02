import 'package:flutter/material.dart';

/// M1 — Canonical top chip shared across Live Stream, Party Room, and
/// Private Call. Web-truth reference: `src/pages/LiveStream.tsx` header
/// and `src/pages/PartyRoom.tsx` header (host chip + counters + close).
class RoomTopBar extends StatelessWidget {
  const RoomTopBar({
    super.key,
    required this.hostAvatarUrl,
    required this.hostName,
    required this.subtitle,
    required this.onClose,
    this.hostLevel,
    this.isFollowing = false,
    this.showFollow = true,
    this.onFollow,
    this.viewerCount,
    this.onOpenViewers,
    this.trailing,
  });

  final String? hostAvatarUrl;
  final String hostName;
  final String subtitle;
  final int? hostLevel;
  final bool isFollowing;
  final bool showFollow;
  final VoidCallback? onFollow;
  final int? viewerCount;
  final VoidCallback? onOpenViewers;
  final VoidCallback onClose;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        12,
        MediaQuery.of(context).padding.top + 8,
        12,
        0,
      ),
      child: Row(
        children: [
          // Host chip (avatar + name + follow)
          Container(
            padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.42),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [Color(0xFFEC4899), Color(0xFF8B5CF6)],
                    ),
                  ),
                  padding: const EdgeInsets.all(2),
                  child: ClipOval(
                    child: hostAvatarUrl != null && hostAvatarUrl!.isNotEmpty
                        ? Image.network(
                            hostAvatarUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _AvatarFallback(
                              name: hostName,
                            ),
                          )
                        : _AvatarFallback(name: hostName),
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 120),
                          child: Text(
                            hostName,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (hostLevel != null) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFFF59E0B), Color(0xFFEF4444)],
                              ),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Lv.$hostLevel',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 1),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Color(0xB3FFFFFF),
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                if (showFollow && !isFollowing && onFollow != null) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: onFollow,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFEC4899), Color(0xFFA855F7)],
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Text(
                        'Follow',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Spacer(),
          if (viewerCount != null)
            GestureDetector(
              onTap: onOpenViewers,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.42),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.visibility_rounded,
                        size: 13, color: Color(0xD9FFFFFF)),
                    const SizedBox(width: 4),
                    Text(
                      _fmtCount(viewerCount!),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (trailing != null) ...[
            trailing!,
            const SizedBox(width: 8),
          ],
          _CloseOrb(onTap: onClose),
        ],
      ),
    );
  }

  static String _fmtCount(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    final letter =
        name.isNotEmpty ? name.trim().substring(0, 1).toUpperCase() : '?';
    return Container(
      color: const Color(0xFF1E1B4B),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CloseOrb extends StatelessWidget {
  const _CloseOrb({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkResponse(
      radius: 24,
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.42),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withOpacity(0.12)),
        ),
        child: const Icon(Icons.close_rounded,
            color: Colors.white, size: 18),
      ),
    );
  }
}

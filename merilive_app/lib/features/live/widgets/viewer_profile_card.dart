import 'package:flutter/material.dart';

/// Flutter port of `ViewerProfileCard.tsx` — compact profile popover used
/// from viewer list. Simpler than PremiumViewerProfileCard; single row info
/// with follow + gift shortcut.
class ViewerProfileCardData {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int level;
  final bool isFollowing;
  const ViewerProfileCardData({
    required this.userId,
    required this.name,
    required this.level,
    this.avatarUrl,
    this.isFollowing = false,
  });
}

class ViewerProfileCard extends StatelessWidget {
  final ViewerProfileCardData data;
  final VoidCallback? onFollow;
  final VoidCallback? onSendGift;
  final VoidCallback? onOpenFull;
  const ViewerProfileCard({
    super.key,
    required this.data,
    this.onFollow,
    this.onSendGift,
    this.onOpenFull,
  });

  static Future<void> show(BuildContext context, ViewerProfileCardData data,
      {VoidCallback? onFollow,
      VoidCallback? onSendGift,
      VoidCallback? onOpenFull}) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(16),
        child: ViewerProfileCard(
          data: data,
          onFollow: onFollow,
          onSendGift: onSendGift,
          onOpenFull: onOpenFull,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: const Color(0xFF1E293B),
                backgroundImage: (data.avatarUrl != null &&
                        data.avatarUrl!.isNotEmpty)
                    ? NetworkImage(data.avatarUrl!)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(data.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [
                          Color(0xFF3B82F6),
                          Color(0xFF8B5CF6)
                        ]),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('Lv ${data.level}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onOpenFull,
                child: const Text('View',
                    style: TextStyle(color: Colors.white70)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onFollow,
                  icon: Icon(
                      data.isFollowing ? Icons.check : Icons.person_add,
                      size: 16),
                  label: Text(data.isFollowing ? 'Following' : 'Follow'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: Colors.white.withOpacity(0.2)),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onSendGift,
                  icon: const Icon(Icons.card_giftcard, size: 16),
                  label: const Text('Gift'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEC4899),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// R4 — Right-rail actions (avatar/follow, like, comment, gift, share, more).
//
// Layout matches Chamet/Bigo/TikTok pattern: 56dp column pinned to the right
// edge, safe-area aware, with icon + count label. Like uses optimistic UI
// through ReelsFeedCubit.applyLikeToggle so the tap feels instant even on
// slow networks. Comment/gift/share raise callbacks the parent handles
// (bottom sheets land in R6/R7). "More" shows report/block via a menu.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/reels_models.dart';

typedef ReelActionCallback = void Function(Reel reel);

class ReelRightRail extends StatelessWidget {
  const ReelRightRail({
    super.key,
    required this.reel,
    required this.onLike,
    required this.onFollow,
    required this.onAvatarTap,
    required this.onComment,
    required this.onGift,
    required this.onShare,
    required this.onMore,
  });

  final Reel reel;
  final ReelActionCallback onLike;
  final ReelActionCallback onFollow;
  final ReelActionCallback onAvatarTap;
  final ReelActionCallback onComment;
  final ReelActionCallback onGift;
  final ReelActionCallback onShare;
  final ReelActionCallback onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).padding.bottom + 96,
        right: 8,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _AvatarWithFollow(
            reel: reel,
            onAvatarTap: () => onAvatarTap(reel),
            onFollow: () => onFollow(reel),
          ),
          const SizedBox(height: 20),
          _RailAction(
            icon: reel.isLiked
                ? Icons.favorite_rounded
                : Icons.favorite_border_rounded,
            color: reel.isLiked ? const Color(0xFFFF2E63) : Colors.white,
            count: reel.likeCount,
            onTap: () => onLike(reel),
          ),
          const SizedBox(height: 18),
          _RailAction(
            icon: Icons.mode_comment_outlined,
            color: Colors.white,
            count: reel.commentCount,
            onTap: () => onComment(reel),
          ),
          const SizedBox(height: 18),
          _RailAction(
            icon: Icons.card_giftcard_rounded,
            color: const Color(0xFFFFC542),
            count: reel.beansEarned,
            onTap: () => onGift(reel),
          ),
          const SizedBox(height: 18),
          _RailAction(
            icon: Icons.reply_rounded,
            color: Colors.white,
            count: reel.shareCount,
            onTap: () => onShare(reel),
            iconTransform: Matrix4.rotationY(3.14159),
          ),
          const SizedBox(height: 18),
          _RailIconButton(
            icon: Icons.more_horiz_rounded,
            onTap: () => onMore(reel),
          ),
        ],
      ),
    );
  }
}

class _AvatarWithFollow extends StatelessWidget {
  const _AvatarWithFollow({
    required this.reel,
    required this.onAvatarTap,
    required this.onFollow,
  });

  final Reel reel;
  final VoidCallback onAvatarTap;
  final VoidCallback onFollow;

  @override
  Widget build(BuildContext context) {
    final avatar = reel.user?.avatarUrl;
    return SizedBox(
      width: 56,
      height: 64,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topCenter,
        children: [
          GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onAvatarTap();
            },
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: const [
                  BoxShadow(color: Colors.black38, blurRadius: 6),
                ],
              ),
              child: ClipOval(
                child: (avatar != null && avatar.isNotEmpty)
                    ? CachedNetworkImage(
                        imageUrl: avatar,
                        fit: BoxFit.cover,
                        placeholder: (_, __) =>
                            Container(color: const Color(0xFF334155)),
                        errorWidget: (_, __, ___) =>
                            const _AvatarFallback(),
                      )
                    : const _AvatarFallback(),
              ),
            ),
          ),
          if (!reel.isFollowing)
            Positioned(
              bottom: -8,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  onFollow();
                },
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: const BoxDecoration(
                    color: Color(0xFFFF2E63),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(color: Colors.black38, blurRadius: 4),
                    ],
                  ),
                  child: const Icon(Icons.add_rounded,
                      color: Colors.white, size: 16),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback();
  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF334155),
      alignment: Alignment.center,
      child: const Icon(Icons.person_rounded, color: Colors.white70, size: 24),
    );
  }
}

class _RailAction extends StatelessWidget {
  const _RailAction({
    required this.icon,
    required this.color,
    required this.count,
    required this.onTap,
    this.iconTransform,
  });

  final IconData icon;
  final Color color;
  final int count;
  final VoidCallback onTap;
  final Matrix4? iconTransform;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Transform(
              transform: iconTransform ?? Matrix4.identity(),
              alignment: Alignment.center,
              child: Icon(
                icon,
                color: color,
                size: 32,
                shadows: const [
                  Shadow(color: Colors.black45, blurRadius: 6),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _fmt(count),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(color: Colors.black45, blurRadius: 4)],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _fmt(int n) {
    if (n <= 0) return '';
    if (n < 1000) return '$n';
    if (n < 1000000) {
      return '${(n / 1000).toStringAsFixed(n % 1000 == 0 ? 0 : 1)}K';
    }
    return '${(n / 1000000).toStringAsFixed(n % 1000000 == 0 ? 0 : 1)}M';
  }
}

class _RailIconButton extends StatelessWidget {
  const _RailIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        height: 34,
        child: Icon(
          icon,
          color: Colors.white,
          size: 26,
          shadows: const [Shadow(color: Colors.black45, blurRadius: 6)],
        ),
      ),
    );
  }
}

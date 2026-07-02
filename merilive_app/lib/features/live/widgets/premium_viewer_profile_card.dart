import 'package:flutter/material.dart';

/// PremiumViewerProfileCard — Flutter port of `src/components/live/PremiumViewerProfileCard.tsx`.
///
/// Shows a large, animated profile card overlay when a viewer avatar is tapped.
/// Matches web tokens: gradient header by level, verified/vip badges, follow +
/// gift + report actions, ~340dp card width, slide-up + fade-in entry (240ms
/// cubic-out), tap-outside dismiss.
class PremiumViewerProfile {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int level;
  final String? country;
  final String? countryFlag;
  final int followers;
  final int following;
  final bool isVerified;
  final bool isVip;
  final bool isHost;
  final bool isFollowing;
  final String? bio;

  const PremiumViewerProfile({
    required this.userId,
    required this.name,
    this.avatarUrl,
    this.level = 1,
    this.country,
    this.countryFlag,
    this.followers = 0,
    this.following = 0,
    this.isVerified = false,
    this.isVip = false,
    this.isHost = false,
    this.isFollowing = false,
    this.bio,
  });
}

class PremiumViewerProfileCard extends StatefulWidget {
  final PremiumViewerProfile profile;
  final VoidCallback? onClose;
  final VoidCallback? onFollow;
  final VoidCallback? onSendGift;
  final VoidCallback? onReport;
  final VoidCallback? onKick; // only host
  final bool viewerIsHost;

  const PremiumViewerProfileCard({
    super.key,
    required this.profile,
    this.onClose,
    this.onFollow,
    this.onSendGift,
    this.onReport,
    this.onKick,
    this.viewerIsHost = false,
  });

  static Future<void> show(
    BuildContext context, {
    required PremiumViewerProfile profile,
    VoidCallback? onFollow,
    VoidCallback? onSendGift,
    VoidCallback? onReport,
    VoidCallback? onKick,
    bool viewerIsHost = false,
  }) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'profile',
      barrierColor: Colors.black.withOpacity(0.55),
      transitionDuration: const Duration(milliseconds: 240),
      pageBuilder: (ctx, a1, a2) => PremiumViewerProfileCard(
        profile: profile,
        onClose: () => Navigator.of(ctx).pop(),
        onFollow: onFollow,
        onSendGift: onSendGift,
        onReport: onReport,
        onKick: onKick,
        viewerIsHost: viewerIsHost,
      ),
      transitionBuilder: (ctx, anim, _, child) {
        final curved =
            CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.06),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  @override
  State<PremiumViewerProfileCard> createState() =>
      _PremiumViewerProfileCardState();
}

class _PremiumViewerProfileCardState extends State<PremiumViewerProfileCard> {
  List<Color> _headerGradient() {
    final lv = widget.profile.level;
    if (lv >= 60) {
      return const [Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFEC4899)];
    }
    if (lv >= 40) {
      return const [Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFFF43F5E)];
    }
    if (lv >= 20) {
      return const [Color(0xFF3B82F6), Color(0xFF8B5CF6)];
    }
    return const [Color(0xFF64748B), Color(0xFF334155)];
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final grad = _headerGradient();
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: 340,
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.06)),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withOpacity(0.6),
                    blurRadius: 40,
                    offset: const Offset(0, 20)),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // header
                Container(
                  height: 110,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: grad),
                  ),
                  child: Stack(
                    children: [
                      Positioned(
                        top: 8,
                        right: 8,
                        child: IconButton(
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: widget.onClose,
                        ),
                      ),
                    ],
                  ),
                ),
                Transform.translate(
                  offset: const Offset(0, -44),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(colors: grad),
                        ),
                        child: CircleAvatar(
                          radius: 42,
                          backgroundColor: const Color(0xFF1E293B),
                          backgroundImage: (p.avatarUrl != null &&
                                  p.avatarUrl!.isNotEmpty)
                              ? NetworkImage(p.avatarUrl!)
                              : null,
                          child: (p.avatarUrl == null || p.avatarUrl!.isEmpty)
                              ? Text(
                                  p.name.isNotEmpty
                                      ? p.name.substring(0, 1).toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                      fontSize: 30,
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700),
                                )
                              : null,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Flexible(
                            child: Text(
                              p.name,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          if (p.isVerified) ...[
                            const SizedBox(width: 4),
                            const Icon(Icons.verified,
                                color: Color(0xFF3B82F6), size: 18),
                          ],
                          if (p.isVip) ...[
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(colors: [
                                  Color(0xFFF59E0B),
                                  Color(0xFFEF4444)
                                ]),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text('VIP',
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: grad),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text('Lv ${p.level}',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700)),
                          ),
                          if (p.countryFlag != null) ...[
                            const SizedBox(width: 6),
                            Text(p.countryFlag!,
                                style: const TextStyle(fontSize: 14)),
                          ],
                          if (p.country != null) ...[
                            const SizedBox(width: 4),
                            Text(p.country!,
                                style: TextStyle(
                                    color: Colors.white.withOpacity(0.7),
                                    fontSize: 11)),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _stat('Followers', p.followers),
                          Container(
                              height: 26,
                              width: 1,
                              color: Colors.white.withOpacity(0.08),
                              margin: const EdgeInsets.symmetric(
                                  horizontal: 18)),
                          _stat('Following', p.following),
                        ],
                      ),
                      if (p.bio != null && p.bio!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Padding(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 20),
                          child: Text(
                            p.bio!,
                            textAlign: TextAlign.center,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: Colors.white.withOpacity(0.75),
                                fontSize: 12,
                                height: 1.35),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            Expanded(
                              child: _followBtn(p.isFollowing),
                            ),
                            const SizedBox(width: 10),
                            _iconBtn(Icons.card_giftcard, widget.onSendGift,
                                grad),
                            const SizedBox(width: 8),
                            _iconBtn(Icons.report_gmailerrorred_outlined,
                                widget.onReport, const [
                              Color(0xFF64748B),
                              Color(0xFF334155)
                            ]),
                            if (widget.viewerIsHost) ...[
                              const SizedBox(width: 8),
                              _iconBtn(Icons.block, widget.onKick, const [
                                Color(0xFFEF4444),
                                Color(0xFF991B1B)
                              ]),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stat(String label, int value) {
    return Column(
      children: [
        Text(_fmt(value),
            style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(label,
            style: TextStyle(
                color: Colors.white.withOpacity(0.55),
                fontSize: 10,
                letterSpacing: 0.4)),
      ],
    );
  }

  Widget _followBtn(bool isFollowing) {
    return SizedBox(
      height: 40,
      child: ElevatedButton(
        onPressed: widget.onFollow,
        style: ElevatedButton.styleFrom(
          backgroundColor:
              isFollowing ? const Color(0xFF1E293B) : const Color(0xFFEC4899),
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: isFollowing
                  ? BorderSide(color: Colors.white.withOpacity(0.15))
                  : BorderSide.none),
        ),
        child: Text(isFollowing ? 'Following' : 'Follow',
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _iconBtn(IconData i, VoidCallback? onTap, List<Color> grad) {
    return InkResponse(
      onTap: onTap,
      radius: 26,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: grad),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(i, color: Colors.white, size: 20),
      ),
    );
  }

  String _fmt(int n) {
    if (n < 1000) return '$n';
    if (n < 1000000) {
      final v = n / 1000.0;
      return '${v.toStringAsFixed(v < 10 ? 1 : 0).replaceAll('.0', '')}K';
    }
    final v = n / 1000000.0;
    return '${v.toStringAsFixed(v < 10 ? 1 : 0).replaceAll('.0', '')}M';
  }
}

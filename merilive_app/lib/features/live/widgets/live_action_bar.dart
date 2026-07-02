import 'package:flutter/material.dart';

/// A3 — LiveStream bottom action row (viewer + host parity).
///
/// Web-truth reference: `src/pages/LiveStream.tsx` bottom action bar
/// (Like / Share / Gift / More + host quick-actions Beauty / Flip / Mic).
///
/// Actual gift panel, share-sheet, PK / beauty / music etc. remain
/// bridged to native — this widget only fires callbacks.
class LiveActionBar extends StatelessWidget {
  const LiveActionBar({
    super.key,
    required this.isHost,
    required this.busy,
    required this.isMicMuted,
    required this.isCamOff,
    required this.onGift,
    required this.onShare,
    required this.onLike,
    required this.onMore,
    required this.onEndOrLeave,
    required this.onToggleMic,
    required this.onToggleCam,
    required this.onFlipCam,
    required this.onBeauty,
  });

  final bool isHost;
  final bool busy;
  final bool isMicMuted;
  final bool isCamOff;

  final VoidCallback onGift;
  final VoidCallback onShare;
  final VoidCallback onLike;
  final VoidCallback onMore;
  final VoidCallback onEndOrLeave;

  // Host-only
  final VoidCallback onToggleMic;
  final VoidCallback onToggleCam;
  final VoidCallback onFlipCam;
  final VoidCallback onBeauty;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        12,
        14,
        12,
        MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xE6000000), Color(0x00000000)],
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isHost) ...[
            _HostQuickRow(
              isMicMuted: isMicMuted,
              isCamOff: isCamOff,
              onToggleMic: onToggleMic,
              onToggleCam: onToggleCam,
              onFlipCam: onFlipCam,
              onBeauty: onBeauty,
            ),
            const SizedBox(height: 10),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _EndOrb(
                isHost: isHost,
                busy: busy,
                onTap: onEndOrLeave,
              ),
              _ActionOrb(
                icon: Icons.favorite_rounded,
                gradient: const [Color(0xFFF43F5E), Color(0xFFEC4899)],
                onTap: onLike,
              ),
              _ActionOrb(
                icon: Icons.ios_share_rounded,
                gradient: const [Color(0xFF22D3EE), Color(0xFF3B82F6)],
                onTap: onShare,
              ),
              _GiftOrb(onTap: onGift),
              _ActionOrb(
                icon: Icons.more_horiz_rounded,
                gradient: const [Color(0xFF64748B), Color(0xFF334155)],
                onTap: onMore,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HostQuickRow extends StatelessWidget {
  const _HostQuickRow({
    required this.isMicMuted,
    required this.isCamOff,
    required this.onToggleMic,
    required this.onToggleCam,
    required this.onFlipCam,
    required this.onBeauty,
  });

  final bool isMicMuted;
  final bool isCamOff;
  final VoidCallback onToggleMic;
  final VoidCallback onToggleCam;
  final VoidCallback onFlipCam;
  final VoidCallback onBeauty;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _HostChip(
            icon: isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
            label: isMicMuted ? 'Unmute' : 'Mute',
            active: !isMicMuted,
            onTap: onToggleMic,
          ),
          _HostChip(
            icon: isCamOff
                ? Icons.videocam_off_rounded
                : Icons.videocam_rounded,
            label: isCamOff ? 'Cam On' : 'Cam Off',
            active: !isCamOff,
            onTap: onToggleCam,
          ),
          _HostChip(
            icon: Icons.cameraswitch_rounded,
            label: 'Flip',
            active: true,
            onTap: onFlipCam,
          ),
          _HostChip(
            icon: Icons.auto_awesome_rounded,
            label: 'Beauty',
            active: true,
            onTap: onBeauty,
          ),
        ],
      ),
    );
  }
}

class _HostChip extends StatelessWidget {
  const _HostChip({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      radius: 26,
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: active
                  ? Colors.white.withOpacity(0.16)
                  : const Color(0xFFEF4444).withOpacity(0.9),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 18),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionOrb extends StatelessWidget {
  const _ActionOrb({
    required this.icon,
    required this.gradient,
    required this.onTap,
  });
  final IconData icon;
  final List<Color> gradient;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      radius: 30,
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: gradient),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: gradient.last.withOpacity(0.45),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }
}

class _GiftOrb extends StatelessWidget {
  const _GiftOrb({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      radius: 34,
      onTap: onTap,
      child: Container(
        width: 56,
        height: 56,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFDE047), Color(0xFFEC4899), Color(0xFF8B5CF6)],
          ),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Color(0x66EC4899),
              blurRadius: 18,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: const Icon(Icons.card_giftcard_rounded,
            color: Colors.white, size: 28),
      ),
    );
  }
}

class _EndOrb extends StatelessWidget {
  const _EndOrb({
    required this.isHost,
    required this.busy,
    required this.onTap,
  });
  final bool isHost;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color =
        isHost ? const Color(0xFFEF4444) : Colors.white.withOpacity(0.16);
    return InkResponse(
      radius: 30,
      onTap: busy ? null : onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24),
        ),
        child: busy
            ? const Padding(
                padding: EdgeInsets.all(14),
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : Icon(
                isHost ? Icons.stop_rounded : Icons.logout_rounded,
                color: Colors.white,
                size: 22,
              ),
      ),
    );
  }
}

/// Bottom-sheet "More" grid — matches Web More menu (parity slice).
class LiveMoreSheet extends StatelessWidget {
  const LiveMoreSheet({
    super.key,
    required this.isHost,
    required this.onSelect,
  });

  final bool isHost;
  final void Function(String id) onSelect;

  static const _viewer = <_MoreItem>[
    _MoreItem('like', 'Like', Icons.favorite_rounded, [Color(0xFFF43F5E), Color(0xFFEC4899)]),
    _MoreItem('share', 'Share', Icons.ios_share_rounded, [Color(0xFF22D3EE), Color(0xFF3B82F6)]),
    _MoreItem('games', 'Games', Icons.videogame_asset_rounded, [Color(0xFF8B5CF6), Color(0xFF6366F1)]),
    _MoreItem('multiguest', 'Guests', Icons.groups_2_rounded, [Color(0xFFA855F7), Color(0xFF6366F1)]),
    _MoreItem('raise_hand', 'Raise Hand', Icons.pan_tool_rounded, [Color(0xFFF59E0B), Color(0xFFEAB308)]),
    _MoreItem('tasks', 'Tasks', Icons.checklist_rounded, [Color(0xFFF59E0B), Color(0xFFF97316)]),
    _MoreItem('topup', 'Top Up', Icons.diamond_rounded, [Color(0xFF10B981), Color(0xFF14B8A6)]),
    _MoreItem('music', 'Music', Icons.music_note_rounded, [Color(0xFFD946EF), Color(0xFFEC4899)]),
    _MoreItem('react', 'React', Icons.emoji_emotions_rounded, [Color(0xFFFACC15), Color(0xFFF97316)]),
    _MoreItem('report', 'Report', Icons.flag_rounded, [Color(0xFFEF4444), Color(0xFFF97316)]),
  ];

  static const _hostExtras = <_MoreItem>[
    _MoreItem('raise_queue', 'Hand Queue', Icons.pan_tool_alt_rounded, [Color(0xFFF59E0B), Color(0xFFEAB308)]),
    _MoreItem('pk', 'PK Battle', Icons.sports_kabaddi_rounded, [Color(0xFFF59E0B), Color(0xFFEA580C)]),
    _MoreItem('sticker', 'Stickers', Icons.emoji_emotions_outlined, [Color(0xFFFACC15), Color(0xFFF59E0B)]),
    _MoreItem('vbg', 'Virtual BG', Icons.image_rounded, [Color(0xFF14B8A6), Color(0xFF10B981)]),
    _MoreItem('noise', 'Noise Cancel', Icons.graphic_eq_rounded, [Color(0xFF6366F1), Color(0xFF3B82F6)]),
  ];

  @override
  Widget build(BuildContext context) {
    final items = [..._viewer, if (isHost) ..._hostExtras];
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 14),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 0.85,
              children: items
                  .map((it) => InkResponse(
                        radius: 40,
                        onTap: () {
                          Navigator.of(context).pop();
                          onSelect(it.id);
                        },
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                gradient:
                                    LinearGradient(colors: it.gradient),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        it.gradient.last.withOpacity(0.4),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Icon(it.icon,
                                  color: Colors.white, size: 24),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              it.label,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoreItem {
  const _MoreItem(this.id, this.label, this.icon, this.gradient);
  final String id;
  final String label;
  final IconData icon;
  final List<Color> gradient;
}

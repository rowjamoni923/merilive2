// R7 — Reels share sheet.
//
// Mirrors the TikTok/Chamet share tray: copy deep link, hand off to system
// share, WhatsApp quick share, or Report. Every action records a row in
// `reel_shares` through ReelsFeedCubit.recordShare so the right-rail counter
// bumps optimistically and Realtime reconciles across devices.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bloc/reels_feed_cubit.dart';
import '../data/reels_models.dart';

const String _kReelDeepLinkBase = 'https://merilive.top/reels';

Future<void> showReelShareSheet({
  required BuildContext context,
  required Reel reel,
  required ReelsFeedCubit cubit,
  required VoidCallback onReport,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black54,
    builder: (_) => _ReelShareSheet(
      reel: reel,
      cubit: cubit,
      onReport: onReport,
    ),
  );
}

class _ReelShareSheet extends StatelessWidget {
  const _ReelShareSheet({
    required this.reel,
    required this.cubit,
    required this.onReport,
  });

  final Reel reel;
  final ReelsFeedCubit cubit;
  final VoidCallback onReport;

  String get _link => '$_kReelDeepLinkBase/${reel.id}';

  String get _title {
    final name = reel.user?.displayName;
    return name != null && name.isNotEmpty
        ? '$name on MeriLive'
        : 'Check this reel on MeriLive';
  }

  Future<void> _copyLink(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: _link));
    unawaited(cubit.recordShare(
      reelId: reel.id,
      platform: 'copy',
      shareType: 'copy_link',
    ));
    if (context.mounted) {
      Navigator.of(context).maybePop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Link copied'),
          duration: Duration(milliseconds: 1200),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _systemShare(BuildContext context) async {
    await Share.share('$_title\n$_link', subject: _title);
    unawaited(cubit.recordShare(
      reelId: reel.id,
      platform: 'system',
      shareType: 'external',
    ));
    if (context.mounted) Navigator.of(context).maybePop();
  }

  Future<void> _whatsappShare(BuildContext context) async {
    final text = Uri.encodeComponent('$_title\n$_link');
    final uri = Uri.parse('https://wa.me/?text=$text');
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      await _systemShare(context);
      return;
    }
    unawaited(cubit.recordShare(
      reelId: reel.id,
      platform: 'whatsapp',
      shareType: 'external',
    ));
    if (context.mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF12131A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Share',
              style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 14),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _ShareChip(icon: Icons.link, label: 'Copy link', onTap: () => _copyLink(context)),
                  _ShareChip(icon: Icons.chat_bubble, label: 'WhatsApp', color: const Color(0xFF25D366), onTap: () => _whatsappShare(context)),
                  _ShareChip(icon: Icons.ios_share, label: 'More', onTap: () => _systemShare(context)),
                  _ShareChip(icon: Icons.flag_outlined, label: 'Report', color: const Color(0xFFFF6262), onTap: () {
                    Navigator.of(context).maybePop();
                    onReport();
                  }),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShareChip extends StatelessWidget {
  const _ShareChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final bg = (color ?? Colors.white).withOpacity(color == null ? 0.12 : 0.18);
    return Padding(
      padding: const EdgeInsets.only(right: 14),
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
              child: Icon(icon, color: color ?? Colors.white, size: 22),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: 68,
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Local unawaited so we don't force a dart:async import in every caller.
void unawaited(Future<void> f) {}

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.gr.dart';
import '../../../core/theme/design_tokens.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../auth/bloc/auth_event.dart';
import '../../embedded/embedded_web_page.dart';

/// M11 — Profile tab landing page.
///
/// A grouped menu that exposes every non-room web surface (wallet, profile,
/// followers, notifications, agency, noble, VIP, shop, leaderboards, events,
/// daily rewards, tasks, face verification, settings, DM chat) via
/// [M11Routes]. Each entry pushes an [EmbeddedWebPage] today; when a native
/// Flutter replacement lands, only the corresponding `M11Routes.open…`
/// body flips — call sites stay the same.
class ProfileTabPage extends StatelessWidget {
  const ProfileTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = Supabase.instance.client.auth.currentUser?.id;
    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _Header(uid: uid)),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            sliver: SliverList.list(
              children: [
                _Section(title: 'Wallet', tiles: [
                  _Tile(
                    icon: Icons.account_balance_wallet_rounded,
                    label: 'Wallet',
                    color: const Color(0xFFF59E0B),
                    onTap: () => M11Routes.openWallet(context),
                  ),
                  _Tile(
                    icon: Icons.add_card_rounded,
                    label: 'Recharge',
                    color: const Color(0xFF10B981),
                    onTap: () => M11Routes.openRecharge(context),
                  ),
                  _Tile(
                    icon: Icons.diamond_rounded,
                    label: 'Diamond Exchange',
                    color: const Color(0xFF06B6D4),
                    onTap: () => M11Routes.openDiamondExchange(context),
                  ),
                ]),
                _Section(title: 'Identity', tiles: [
                  _Tile(
                    icon: Icons.person_rounded,
                    label: 'My Profile',
                    color: const Color(0xFF8B5CF6),
                    onTap: uid == null
                        ? null
                        : () => M11Routes.openProfile(context, uid),
                  ),
                  _Tile(
                    icon: Icons.edit_rounded,
                    label: 'Edit Profile',
                    color: const Color(0xFF6366F1),
                    onTap: () => M11Routes.openProfileEdit(context),
                  ),
                  _Tile(
                    icon: Icons.group_rounded,
                    label: 'Followers',
                    color: const Color(0xFFEC4899),
                    onTap: () => M11Routes.openFollowers(context),
                  ),
                  _Tile(
                    icon: Icons.person_add_rounded,
                    label: 'Following',
                    color: const Color(0xFFF43F5E),
                    onTap: () => M11Routes.openFollowing(context),
                  ),
                  _Tile(
                    icon: Icons.block_rounded,
                    label: 'Blocked',
                    color: const Color(0xFF64748B),
                    onTap: () => M11Routes.openBlocked(context),
                  ),
                ]),
                _Section(title: 'Inbox', tiles: [
                  _Tile(
                    icon: Icons.chat_rounded,
                    label: 'Messages',
                    color: const Color(0xFF3B82F6),
                    onTap: () => M11Routes.openChatList(context),
                  ),
                  _Tile(
                    icon: Icons.notifications_rounded,
                    label: 'Notifications',
                    color: const Color(0xFFEAB308),
                    onTap: () => M11Routes.openNotifications(context),
                  ),
                  _Tile(
                    icon: Icons.tune_rounded,
                    label: 'Notification Preferences',
                    color: const Color(0xFF7C3AED),
                    onTap: () => M11Routes.openNotificationPrefs(context),
                  ),
                ]),
                _Section(title: 'Programs', tiles: [
                  _Tile(
                    icon: Icons.workspace_premium_rounded,
                    label: 'Noble',
                    color: const Color(0xFFD946EF),
                    onTap: () => M11Routes.openNoble(context),
                  ),
                  _Tile(
                    icon: Icons.star_rounded,
                    label: 'VIP',
                    color: const Color(0xFFF97316),
                    onTap: () => M11Routes.openVip(context),
                  ),
                  _Tile(
                    icon: Icons.storefront_rounded,
                    label: 'Shop',
                    color: const Color(0xFF14B8A6),
                    onTap: () => M11Routes.openShop(context),
                  ),
                  _Tile(
                    icon: Icons.apartment_rounded,
                    label: 'Agency Portal',
                    color: const Color(0xFF0EA5E9),
                    onTap: () => M11Routes.openAgencyPortal(context),
                  ),
                ]),
                _Section(title: 'Discover', tiles: [
                  _Tile(
                    icon: Icons.leaderboard_rounded,
                    label: 'Leaderboards',
                    color: const Color(0xFFEF4444),
                    onTap: () => M11Routes.openLeaderboards(context),
                  ),
                  _Tile(
                    icon: Icons.event_rounded,
                    label: 'Events',
                    color: const Color(0xFFF59E0B),
                    onTap: () => M11Routes.openEvents(context),
                  ),
                  _Tile(
                    icon: Icons.card_giftcard_rounded,
                    label: 'Daily Rewards',
                    color: const Color(0xFF10B981),
                    onTap: () => M11Routes.openDailyRewards(context),
                  ),
                  _Tile(
                    icon: Icons.checklist_rounded,
                    label: 'Daily Tasks',
                    color: const Color(0xFF22C55E),
                    onTap: () => M11Routes.openTasks(context),
                  ),
                ]),
                _Section(title: 'Account', tiles: [
                  _Tile(
                    icon: Icons.verified_user_rounded,
                    label: 'Face Verification',
                    color: const Color(0xFF0EA5E9),
                    onTap: () => M11Routes.openFaceVerification(context),
                  ),
                  _Tile(
                    icon: Icons.help_outline_rounded,
                    label: 'Help Center',
                    color: const Color(0xFF6B7280),
                    onTap: () => M11Routes.openHelpCenter(context),
                  ),
                  _Tile(
                    icon: Icons.support_agent_rounded,
                    label: 'Contact Support',
                    color: const Color(0xFF64748B),
                    onTap: () => M11Routes.openSupportTicket(context),
                  ),
                  _Tile(
                    icon: Icons.settings_rounded,
                    label: 'Settings',
                    color: const Color(0xFF475569),
                    onTap: () => M11Routes.openSettings(context),
                  ),
                ]),
                const SizedBox(height: 8),
                Center(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      context.read<AuthBloc>().add(const SignedOut());
                      await context.router
                          .replaceAll([const AuthLandingRoute()]);
                    },
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0x33C9A84C)),
                      foregroundColor: const Color(0xFF334155),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    icon: const Icon(Icons.logout_rounded, size: 18),
                    label: const Text('Sign out'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.uid});
  final String? uid;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Row(
        children: [
          ShaderMask(
            blendMode: BlendMode.srcIn,
            shaderCallback: (r) =>
                const LinearGradient(colors: DT.tabProfile).createShader(r),
            child: const Icon(Icons.person_rounded, size: 40),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'My Profile',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0F172A),
                  ),
                ),
                Text(
                  'Wallet, identity, programs, settings',
                  style: TextStyle(fontSize: 12, color: DT.navInkMuted),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings_rounded,
                color: Color(0xFF475569), size: 22),
            onPressed: () => M11Routes.openSettings(context),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.tiles});
  final String title;
  final List<_Tile> tiles;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.1,
                color: Color(0xFF64748B),
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0F0F172A),
                  blurRadius: 14,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                for (int i = 0; i < tiles.length; i++) ...[
                  tiles[i],
                  if (i != tiles.length - 1)
                    const Divider(
                      height: 1,
                      thickness: 1,
                      color: Color(0x0F0F172A),
                      indent: 60,
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                size: 20, color: Color(0xFF94A3B8)),
          ],
        ),
      ),
    );
  }
}

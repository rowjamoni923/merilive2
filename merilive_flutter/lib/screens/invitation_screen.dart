import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../utils/design_system.dart';

class MyInvitationScreen extends StatefulWidget {
  const MyInvitationScreen({super.key});

  @override
  State<MyInvitationScreen> createState() => _MyInvitationScreenState();
}

class _MyInvitationScreenState extends State<MyInvitationScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  late TabController _tabController;
  
  List<Map<String, dynamic>> _tiers = [];
  List<Map<String, dynamic>> _leaderboard = [];
  List<Map<String, dynamic>> _myInvited = [];
  Map<String, dynamic> _stats = {'total_invites': 0, 'total_rewards': 0};
  String? _bannerUrl;
  String? _userId;
  String _shareLink = "";
  Set<String> _claimedTierIds = {};
  String? _claimingTierId;

  @override
  void initState() {
    super.initState();
    _userId = _api.currentUserId;
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
    _setupRealtime();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getInvitationTiers(),
        _api.getInvitationLeaderboard(),
        _api.getMyInvitedUsers(),
        _api.getInvitationSummary(),
        _api.getAppSetting('invitation_banner_url'),
        _api.getMyProfile(),
      ]);

      _tiers = List<Map<String, dynamic>>.from(results[0] as List);
      _leaderboard = List<Map<String, dynamic>>.from(results[1] as List);
      _myInvited = List<Map<String, dynamic>>.from(results[2] as List);
      _stats = results[3] as Map<String, dynamic>;
      _bannerUrl = results[4] as String?;
      
      final profile = results[5] as Map<String, dynamic>?;
      if (profile != null && profile['app_uid'] != null) {
        _shareLink = "https://merilive.app/invite/${profile['app_uid']}";
      }

      // Fetch claimed tiers directly from table for accuracy
      final claims = await _api.getSupabase()
          .from('invitation_reward_claims')
          .select('invitation_id')
          .eq('claimed_by', _userId!);
      _claimedTierIds = (claims as List).map((c) => c['invitation_id'].toString()).toSet();

    } catch (e) {
      debugPrint("Error loading invitation data: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtime() {
    _api.getSupabase()
        .channel('invitation-sync')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'user_invitations',
          callback: (p) => _loadData(),
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0F1015), body: Center(child: CircularProgressIndicator(color: Colors.amber)));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          _buildSliverAppBar(),
          SliverToBoxAdapter(child: _buildBanner()),
          SliverToBoxAdapter(child: _buildShareCard()),
          SliverToBoxAdapter(child: const SizedBox(height: 12)),
          SliverPersistentHeader(
            pinned: true,
            delegate: _SliverAppBarDelegate(
              Container(
                color: const Color(0xFF0F1015),
                child: TabBar(
                  controller: _tabController,
                  indicatorColor: Colors.amber,
                  labelColor: Colors.amber,
                  unselectedLabelColor: Colors.white38,
                  indicatorSize: TabBarIndicatorSize.label,
                  labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
                  tabs: const [
                    Tab(text: "Rewards"),
                    Tab(text: "Leaderboard"),
                    Tab(text: "My Invites"),
                  ],
                ),
              ),
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildRewardsTab(),
            _buildLeaderboardTab(),
            _buildMyInvitesTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      pinned: true,
      backgroundColor: const Color(0xFF0F1015),
      elevation: 0,
      leading: IconButton(
        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text("Invite & Earn", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
      actions: [
        IconButton(icon: const Icon(LucideIcons.helpCircle, color: Colors.white38, size: 20), onPressed: () {}),
      ],
    );
  }

  Widget _buildBanner() {
    return FadeInDown(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        height: 180,
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(32),
          gradient: const LinearGradient(colors: [Color(0xFF1E1B23), Color(0xFF131118)]),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 25, offset: const Offset(0, 15))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(32),
          child: Stack(
            children: [
              if (_bannerUrl != null)
                Positioned.fill(child: Image.network(_bannerUrl!, fit: BoxFit.cover, errorBuilder: (c,e,s) => const SizedBox()))
              else
                Positioned.fill(child: Container(decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF)])))),
              
              // Premium Overlay Effects
              Positioned.fill(child: Container(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withOpacity(0.2), Colors.black.withOpacity(0.5)])))),
              
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: Colors.amber.withOpacity(0.2), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.amber.withOpacity(0.3))),
                      child: Text("EXCLUSIVE EVENT", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
                    ),
                    const SizedBox(height: 12),
                    Text("Invite Friends", style: GoogleFonts.outfit(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
                    Text("Unlock Premium Rewards & Badges", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14)),
                  ],
                ),
              ),
              
              // Animated Sparkles
              Positioned(top: 20, right: 30, child: FadeIn(child: const Icon(LucideIcons.sparkles, color: Colors.amber, size: 20))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildShareCard() {
    return FadeInUp(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1B23),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
          boxShadow: [BoxShadow(color: Colors.purple.withOpacity(0.05), blurRadius: 40, spreadRadius: -10)],
        ),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                    child: Text(_shareLink, style: GoogleFonts.outfit(color: Colors.white70, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: _shareLink));
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Link Copied!")));
                  },
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                    child: const Icon(LucideIcons.copy, color: Colors.amber, size: 20),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 58,
              child: ElevatedButton.icon(
                onPressed: () => Share.share("Hey! Join me on MeriLive and win rewards! 🎁\n$_shareLink"),
                icon: const Icon(LucideIcons.share2, size: 20),
                label: Text("SHARE INVITE LINK", style: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 15, letterSpacing: 1.2)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF8B5CF6),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  elevation: 12,
                  shadowColor: const Color(0xFF8B5CF6).withOpacity(0.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRewardsTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      physics: const BouncingScrollPhysics(),
      itemCount: _tiers.length,
      itemBuilder: (context, index) {
        final tier = _tiers[index];
        final String tierId = tier['id'].toString();
        final bool isClaimed = _claimedTierIds.contains(tierId);
        final int minInvites = tier['min_invites'] ?? 0;
        final bool canClaim = _stats['total_invites'] >= minInvites;
        
        final color = canClaim ? Colors.amber : Colors.white24;

        return FadeInLeft(
          duration: Duration(milliseconds: 300 + (index * 100)),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: canClaim ? Colors.amber.withOpacity(0.03) : Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: canClaim ? Colors.amber.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                _buildTierBadge(tier['tier_name'] ?? 'Bronze', tier['badge_color']),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tier['tier_name'] ?? "Tier", style: GoogleFonts.outfit(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text("$minInvites+ Invites Required", style: TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          if (tier['reward_beans'] > 0) _buildRewardTag("${tier['reward_beans']} Beans", Colors.amber),
                          const SizedBox(width: 8),
                          if (tier['reward_coins'] > 0) _buildRewardTag("${tier['reward_coins']} Diamonds", Colors.purpleAccent),
                        ],
                      ),
                    ],
                  ),
                ),
                _buildClaimButton(tierId, canClaim, isClaimed),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTierBadge(String name, String? colorHex) {
    String emoji = "🏆";
    if (name.contains("Bronze")) emoji = "🥉";
    else if (name.contains("Silver")) emoji = "🥈";
    else if (name.contains("Gold")) emoji = "🥇";
    else if (name.contains("Platinum")) emoji = "💎";
    else if (name.contains("Diamond")) emoji = "👑";
    else if (name.contains("Legend")) emoji = "🔥";

    final Color bgColor = colorHex != null ? Color(int.parse(colorHex.replaceFirst('#', '0xFF'))) : Colors.amber;

    return Container(
      width: 56, height: 56,
      decoration: BoxDecoration(color: bgColor.withOpacity(0.15), borderRadius: BorderRadius.circular(18), border: Border.all(color: bgColor.withOpacity(0.3))),
      child: Center(child: Text(emoji, style: const TextStyle(fontSize: 26))),
    );
  }

  Widget _buildRewardTag(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900)),
    );
  }

  Widget _buildClaimButton(String tierId, bool canClaim, bool isClaimed) {
    if (isClaimed) {
      return Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.check, color: Colors.green, size: 22));
    }
    return ElevatedButton(
      onPressed: (canClaim && _claimingTierId == null) ? () => _handleClaimTier(tierId) : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.amber,
        foregroundColor: Colors.black,
        disabledBackgroundColor: Colors.white.withOpacity(0.05),
        minimumSize: const Size(80, 42),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 4,
      ),
      child: _claimingTierId == tierId 
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2))
          : Text("CLAIM", style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }

  Widget _buildLeaderboardTab() {
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(child: _buildPodium()),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                if (index < 3) return const SizedBox.shrink();
                final user = _leaderboard[index];
                return _buildLeaderboardItem(index + 1, user);
              },
              childCount: _leaderboard.length,
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 100)),
      ],
    );
  }

  Widget _buildPodium() {
    if (_leaderboard.isEmpty) return const SizedBox.shrink();
    final top1 = _leaderboard.isNotEmpty ? _leaderboard[0] : null;
    final top2 = _leaderboard.length > 1 ? _leaderboard[1] : null;
    final top3 = _leaderboard.length > 2 ? _leaderboard[2] : null;

    return Container(
      padding: const EdgeInsets.all(20),
      height: 280,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          if (top2 != null) _buildPodiumItem(top2, 2, 160, Colors.grey),
          if (top1 != null) _buildPodiumItem(top1, 1, 210, Colors.amber),
          if (top3 != null) _buildPodiumItem(top3, 3, 140, Colors.brown[400]!),
        ],
      ),
    );
  }

  Widget _buildPodiumItem(Map<String, dynamic> user, int rank, double height, Color color) {
    return ElasticInUp(
      duration: Duration(milliseconds: 500 + (rank * 200)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [color, color.withOpacity(0.3)])),
                child: CircleAvatar(radius: rank == 1 ? 42 : 32, backgroundImage: NetworkImage(user['avatar_url'] ?? '')),
              ),
              if (rank == 1)
                Positioned(top: -15, child: FadeInDown(child: const Icon(LucideIcons.crown, color: Colors.amber, size: 28))),
            ],
          ),
          const SizedBox(height: 12),
          Text(user['display_name'] ?? "User", style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
          Text("${user['total_invites']} Invites", style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Container(
            width: rank == 1 ? 90 : 70,
            height: rank == 1 ? 60 : 40,
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [color.withOpacity(0.2), color.withOpacity(0.05)]),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              border: Border.all(color: color.withOpacity(0.3)),
            ),
            child: Center(child: Text("#$rank", style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.w900, fontSize: 18))),
          ),
        ],
      ),
    );
  }

  Widget _buildLeaderboardItem(int rank, Map<String, dynamic> user) {
    final bool isMe = user['user_id'] == _userId;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isMe ? Colors.amber.withOpacity(0.05) : Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: isMe ? Colors.amber.withOpacity(0.3) : Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(10)),
            child: Center(child: Text("$rank", style: GoogleFonts.outfit(color: Colors.white38, fontWeight: FontWeight.w900, fontSize: 12))),
          ),
          const SizedBox(width: 16),
          CircleAvatar(radius: 22, backgroundImage: NetworkImage(user['avatar_url'] ?? '')),
          const SizedBox(width: 16),
          Expanded(child: Text(user['display_name'] ?? "User", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold))),
          Text("${user['total_invites']} Invites", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 13, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _buildMyInvitesTab() {
    if (_myInvited.isEmpty) {
      return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(LucideIcons.users, size: 64, color: Colors.white.withOpacity(0.05)), const SizedBox(height: 16), Text("No friends invited yet", style: TextStyle(color: Colors.white24))]));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _myInvited.length,
      itemBuilder: (context, index) {
        final invite = _myInvited[index];
        final user = invite['invitee'] ?? {};
        return FadeInUp(
          duration: Duration(milliseconds: 300 + (index * 50)),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                CircleAvatar(radius: 26, backgroundImage: NetworkImage(user['avatar_url'] ?? '')),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user['display_name'] ?? "User", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                      Text("ID: ${user['app_uid']}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                  child: const Text("VERIFIED", style: TextStyle(color: Colors.green, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _handleClaimTier(String tierId) async {
    setState(() => _claimingTierId = tierId);
    try {
      final res = await _api.claimInvitationReward(tierId);
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text("🎉 Tier Reward Claimed! +${res['beans'] ?? 0} Beans"),
          backgroundColor: Colors.green,
        ));
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['error'] ?? "Claim failed")));
      }
    } catch (e) {
      debugPrint("Claim error: $e");
    } finally {
      if (mounted) setState(() => _claimingTierId = null);
    }
  }
}

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  _SliverAppBarDelegate(this._child);
  final Widget _child;
  @override
  double get minExtent => 50;
  @override
  double get maxExtent => 50;
  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => _child;
  @override
  bool shouldRebuild(_SliverAppBarDelegate oldDelegate) => false;
}

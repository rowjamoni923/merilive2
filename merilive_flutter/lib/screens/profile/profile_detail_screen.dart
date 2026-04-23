import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:animate_do/animate_do.dart';
import 'dart:ui';
import 'dart:async';

import '../../services/api_service.dart';
import '../../services/gifting_service.dart';
import '../../widgets/avatar_with_frame.dart';
import '../../widgets/level_badge.dart';
import '../../widgets/three_d_icons.dart';
import '../../widgets/animation_handler.dart';
import '../../widgets/premium_gift_panel.dart';
import '../../services/call_provider.dart';
import 'package:provider/provider.dart';

class ProfileDetailScreen extends StatefulWidget {
  final String userId;
  const ProfileDetailScreen({super.key, required this.userId});

  @override
  State<ProfileDetailScreen> createState() => _ProfileDetailScreenState();
}

class _ProfileDetailScreenState extends State<ProfileDetailScreen> {
  final ApiService _api = ApiService();
  final GiftingService _gifting = GiftingService();
  
  Map<String, dynamic>? _profile;
  bool _isLoading = true;
  bool _isFollowing = false;
  int _followersCount = 0;
  int _followingCount = 0;
  int _diamonds = 0;
  int _beans = 0;
  String _hostAvailability = 'offline';
  
  List<String> _posterImages = [];
  List<Map<String, dynamic>> _giftsReceived = [];
  List<Map<String, dynamic>> _giftsSent = [];
  List<Map<String, dynamic>> _userGroups = [];
  int _currentSlideIndex = 0;
  int _activeGiftTab = 0; // 0: Received, 1: Sent
  Timer? _slideshowTimer;
  RealtimeChannel? _profileChannel;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
    _subscribeToProfile();
  }

  @override
  void dispose() {
    _slideshowTimer?.cancel();
    if (_profileChannel != null) {
      _api.getSupabase().removeChannel(_profileChannel!);
    }
    super.dispose();
  }

  void _subscribeToProfile() {
    _profileChannel = _api.getSupabase()
        .channel('public:profiles:id=eq.${widget.userId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'profiles',
          filter: 'id=eq.${widget.userId}',
          callback: (payload) {
            if (payload.newRecord.isNotEmpty && mounted) {
              setState(() {
                _profile = {...(_profile ?? {}), ...payload.newRecord};
                _diamonds = payload.newRecord['diamonds'] ?? _diamonds;
                _beans = payload.newRecord['beans'] ?? _beans;
                _hostAvailability = payload.newRecord['host_availability'] ?? _hostAvailability;
              });
            }
          },
        )
        .subscribe();
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final me = supa.auth.currentUser?.id;

      final results = await Future.wait([
        _api.getProfileModel(widget.userId),
        _api.getProfileStats(widget.userId),
        _api.getPosterImages(widget.userId),
      ]);

      final model = results[0];
      final stats = results[1] as Map<String, dynamic>;
      final posters = results[2] as List<Map<String, dynamic>>;
      
      // Parallel fetch for parity details
      final extraDetails = await Future.wait([
        _api.getGiftTransactionsList(widget.userId),
        _api.getGiftsSentList(widget.userId),
        _api.getUserGroups(widget.userId),
      ]);

      if (mounted && model != null) {
        setState(() {
          _profile = model.toJson();
          _followersCount = stats['followers'] ?? 0;
          _followingCount = stats['following'] ?? 0;
          _diamonds = _profile?['coins'] ?? _profile?['diamond_balance'] ?? 0;
          _beans = _profile?['beans'] ?? _profile?['beans_balance'] ?? 0;
          _hostAvailability = _profile?['host_availability'] ?? 'offline';
          _posterImages = posters.map((e) => e['video_url'] != null ? e['video_url'].toString() : e['image_url'].toString()).toList();
          
          _giftsReceived = extraDetails[0];
          _giftsSent = extraDetails[1];
          _userGroups = extraDetails[2];

          if (_posterImages.isEmpty) {
            _posterImages = [_profile?['cover_url'] ?? _profile?['avatar_url'] ?? "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=800"];
          }
          _isLoading = false;
        });

        if (me != null && me != widget.userId) {
          final followRes = await supa.from('followers').select('id').eq('follower_id', me).eq('following_id', widget.userId).maybeSingle();
          if (mounted) setState(() => _isFollowing = followRes != null);
        }

        _startSlideshow();
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _startSlideshow() {
    _slideshowTimer?.cancel();
    if (_posterImages.length > 1) {
      _slideshowTimer = Timer.periodic(const Duration(seconds: 5), (timer) {
        if (mounted) {
          setState(() => _currentSlideIndex = (_currentSlideIndex + 1) % _posterImages.length);
        }
      });
    }
  }

  void _startCall(Map<String, dynamic> peer) {
    if (peer['host_availability'] != 'online') {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Host is currently offline")));
      return;
    }
    
    context.read<CallProvider>().startCall(
      context,
      hostId: peer['id'],
      hostName: peer['display_name'] ?? 'User',
      hostAvatar: peer['avatar_url'],
      hostLevel: peer['host_level'] ?? 1,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F1015), body: Center(child: CircularProgressIndicator(color: Color(0xFFA855F7))));

    final isOwnProfile = _api.getSupabase().auth.currentUser?.id == widget.userId;

    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: CustomScrollView(
        slivers: [
          _buildSliverAppBar(),
          SliverToBoxAdapter(
            child: Transform.translate(
              offset: const Offset(0, -24),
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFF0F1015),
                  borderRadius: BorderRadius.only(topLeft: Radius.circular(32), topRight: Radius.circular(32)),
                ),
                child: Column(
                  children: [
                    _buildProfileHeaderSection(),
                    if (isOwnProfile && (_profile?['is_host'] == true || _profile?['is_host'] == 'true'))
                       _buildAvailabilityToggle(),
                    _buildStatsRow(),
                    _buildActionButtons(isOwnProfile),
                    _buildInfoSection(),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 400,
      pinned: true,
      backgroundColor: const Color(0xFF0F1015),
      leading: IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(LucideIcons.chevronLeft, color: Colors.white)),
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 800),
              child: _posterImages[_currentSlideIndex].contains('.mp4') 
                ? Container(color: Colors.black, child: const Center(child: Icon(Icons.play_circle_outline, color: Colors.white, size: 64)))
                : CachedNetworkImage(
                    key: ValueKey(_posterImages[_currentSlideIndex]),
                    imageUrl: _posterImages[_currentSlideIndex],
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: double.infinity,
                  ),
            ),
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter, end: Alignment.bottomCenter,
                  colors: [Colors.black.withOpacity(0.4), Colors.transparent, const Color(0xFF0F1015)],
                  stops: const [0.0, 0.6, 1.0],
                ),
              ),
            ),
            // Slideshow Indicators
            if (_posterImages.length > 1)
              Positioned(
                bottom: 48,
                left: 0, right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_posterImages.length, (index) => AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _currentSlideIndex == index ? 24 : 8,
                    height: 4,
                    decoration: BoxDecoration(color: _currentSlideIndex == index ? Colors.white : Colors.white24, borderRadius: BorderRadius.circular(2)),
                  )),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeaderSection() {
    final bool isVerified = _profile?['is_verified'] == true;
    final int userLevel = _profile?['user_level'] ?? 1;
    final int traderLevel = _profile?['trader_level'] ?? 0;
    
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              AvatarWithFrame(
                userId: widget.userId,
                src: _profile?['avatar_url'],
                size: 90,
                isVerified: isVerified,
                level: userLevel,
                frameId: _profile?['equipped_frame_id'],
              ),
              const Spacer(),
              _buildAvailabilityBadge(),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text(_profile?['display_name'] ?? 'User', style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              if (isVerified) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.verified, color: Color(0xFF3B82F6), size: 20)),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text("ID: ${_profile?['app_uid'] ?? '---'}", style: GoogleFonts.spaceMono(color: Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: _profile?['app_uid']?.toString() ?? ''));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("ID Copied")));
                },
                child: const Icon(LucideIcons.copy, color: Colors.white10, size: 14),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: [
              _buildPill("Lv.$userLevel", const Color(0xFFA855F7)),
              if (traderLevel > 0) _buildTraderPill(traderLevel),
              _buildPill("${_profile?['age'] ?? '25'}", const Color(0xFF3B82F6), icon: _profile?['gender'] == 'female' ? Icons.female : Icons.male),
              _buildPill(_profile?['region'] ?? 'Global', Colors.white12, icon: LucideIcons.mapPin),
            ],
          ),
          const SizedBox(height: 20),
          Text(_profile?['bio'] ?? "No bio yet.", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14, height: 1.5)),
        ],
      ),
    );
  }

  Widget _buildAvailabilityBadge() {
    final bool isOnline = _hostAvailability == 'online';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: isOnline ? Colors.greenAccent.withOpacity(0.1) : Colors.redAccent.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: (isOnline ? Colors.greenAccent : Colors.redAccent).withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 6, height: 6, decoration: BoxDecoration(color: isOnline ? Colors.greenAccent : Colors.redAccent, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text(isOnline ? "ONLINE" : "OFFLINE", style: GoogleFonts.outfit(color: isOnline ? Colors.greenAccent : Colors.redAccent, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
        ],
      ),
    );
  }

  Widget _buildPill(String text, Color color, {IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.3))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, color: color, size: 10), const SizedBox(width: 4)],
          Text(text, style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildAvailabilityToggle() {
    final bool isOnline = _hostAvailability == 'online';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      child: InkWell(
        onTap: _handleToggleAvailability,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            gradient: isOnline 
                ? const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)])
                : const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFDC2626)]),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: (isOnline ? Colors.green : Colors.red).withOpacity(0.3),
                blurRadius: 15,
                offset: const Offset(0, 5),
              )
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(isOnline ? LucideIcons.eye : LucideIcons.eyeOff, color: Colors.white, size: 20),
              const SizedBox(width: 12),
              Text(
                isOnline ? "GO OFFLINE" : "GO ONLINE",
                style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 1),
              ),
              if (isOnline) ...[
                const SizedBox(width: 8),
                const SizedBox(width: 6, height: 6, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
              ]
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleToggleAvailability() async {
    HapticFeedback.mediumImpact();
    final success = await _api.toggleAvailability(_hostAvailability);
    if (success) {
      if (mounted) {
        setState(() {
          _hostAvailability = _hostAvailability == 'online' ? 'offline' : 'online';
        });
      }
    }
  }

  Widget _buildTraderPill(int level) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)]), borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.gem, color: Colors.white, size: 10),
          const SizedBox(width: 6),
          Text("Trader Lv.$level", style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _buildStatsRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _buildStatItem(_followingCount, "Following"),
          _buildStatDivider(),
          _buildStatItem(_followersCount, "Followers"),
          _buildStatDivider(),
          _buildStatItem(0, "Friends"),
        ],
      ),
    );
  }

  Widget _buildStatItem(int count, String label) {
    return Column(
      children: [
        Text(_api.formatNumber(count), style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text(label, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildStatDivider() {
    return Container(width: 1, height: 24, color: Colors.white.withOpacity(0.05));
  }

  Widget _buildActionButtons(bool isOwnProfile) {
    if (isOwnProfile) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: InkWell(
              onTap: () => setState(() => _isFollowing = !_isFollowing),
              borderRadius: BorderRadius.circular(16),
              child: Container(
                height: 54,
                decoration: BoxDecoration(
                  gradient: _isFollowing ? null : const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
                  color: _isFollowing ? Colors.white.withOpacity(0.05) : null,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: _isFollowing ? null : [BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
                ),
                child: Center(
                  child: Text(_isFollowing ? "FOLLOWING" : "FOLLOW", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          _buildCircleAction(LucideIcons.messageCircle, Colors.white10),
          const SizedBox(width: 12),
          _buildCircleAction(LucideIcons.gift, const Color(0xFFEC4899), onTap: _showGiftPanel),
          const SizedBox(width: 12),
          _buildCircleAction(LucideIcons.phoneCall, const Color(0xFF10B981), onTap: () => _startCall(_profile!)),
        ],
      ),
    );
  }

  Widget _buildCircleAction(IconData icon, Color color, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 54, height: 54,
        decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.3))),
        child: Icon(icon, color: color == Colors.white10 ? Colors.white : color, size: 22),
      ),
    );
  }

  void _showGiftPanel() {
    final me = _api.getSupabase().auth.currentUser?.id;
    final bool isSelf = me == widget.userId;
    
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => PremiumGiftPanel(
        userCoins: _diamonds, // Sync with real-time state
        onGiftSelected: (gift) async {
          if (isSelf) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Cannot send gifts to yourself")));
            return;
          }
          
          final successRes = await _api.sendGiftTransaction(
            hostId: widget.userId,
            giftId: gift.id!,
            amount: gift.coinValue!,
          );
          
          if (successRes['success'] == true) {
             ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Gift sent to ${_profile?['display_name']}!")));
             _loadInitialData(); // Refresh stats
          } else {
             ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Failed: ${successRes['error']}")));
          }
        },
      ),
    );
  }

  Widget _buildInfoSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle("PRIVILEGES & ASSETS", LucideIcons.sparkles),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildAssetBox(LucideIcons.gem, _diamonds, "Diamonds", const Color(0xFF6366F1)),
              const SizedBox(width: 16),
              _buildAssetBox(LucideIcons.coins, _beans, "Beans", const Color(0xFFFACC15)),
            ],
          ),
          
          const SizedBox(height: 32),
          _buildSectionTitle("GROUPS", LucideIcons.users),
          const SizedBox(height: 16),
          if (_userGroups.isEmpty)
             _buildEmptyState("No groups joined yet")
          else
            SizedBox(
              height: 100,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _userGroups.length,
                itemBuilder: (context, index) {
                  final group = _userGroups[index];
                  return Container(
                    width: 80,
                    margin: const EdgeInsets.only(right: 16),
                    child: Column(
                      children: [
                        Container(
                          width: 60, height: 60,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white10),
                            image: group['icon_url'] != null ? DecorationImage(image: NetworkImage(group['icon_url']), fit: BoxFit.cover) : null,
                          ),
                          child: group['icon_url'] == null ? const Icon(LucideIcons.users, color: Colors.white24, size: 24) : null,
                        ),
                        const SizedBox(height: 6),
                        Text(group['name'] ?? "Group", style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  );
                },
              ),
            ),

          const SizedBox(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildSectionTitle("GIFT WALL", LucideIcons.gift),
              Row(
                children: [
                  _buildMiniTab("Received", 0),
                  const SizedBox(width: 8),
                  _buildMiniTab("Sent", 1),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildGiftGrid(),
        ],
      ),
    );
  }

  Widget _buildMiniTab(String label, int index) {
    bool isActive = _activeGiftTab == index;
    return GestureDetector(
      onTap: () => setState(() => _activeGiftTab = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: isActive ? Colors.white.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isActive ? Colors.white24 : Colors.transparent),
        ),
        child: Text(label, style: GoogleFonts.outfit(color: isActive ? Colors.white : Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Center(child: Text(message, style: const TextStyle(color: Colors.white12, fontSize: 12))),
    );
  }

  Widget _buildGiftGrid() {
    final list = _activeGiftTab == 0 ? _giftsReceived : _giftsSent;
    if (list.isEmpty) return _buildEmptyState("No gifts yet");

    return SizedBox(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: list.length,
        itemBuilder: (context, index) {
          final gift = list[index];
          final gInfo = gift['gifts'] as Map<String, dynamic>?;
          final sender = gift['sender'] as Map<String, dynamic>?;
          
          return GestureDetector(
            onTap: () => _showGiftDetailModal(gift),
            child: Container(
              width: 80,
              margin: const EdgeInsets.only(right: 12),
              child: Column(
                children: [
                  Stack(
                    children: [
                      Container(
                        width: 64, height: 64,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: gInfo?['icon_url'] != null 
                          ? Padding(padding: const EdgeInsets.all(8), child: CachedNetworkImage(imageUrl: gInfo!['icon_url']))
                          : const Icon(LucideIcons.gift, color: Colors.white10, size: 24),
                      ),
                      if (gift['coin_amount'] != null)
                        Positioned(
                          bottom: 2, right: 2,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const BoxDecoration(color: Colors.black87, shape: BoxShape.circle),
                            child: Text("${gift['coin_amount']}", style: const TextStyle(color: Colors.amber, fontSize: 8, fontWeight: FontWeight.bold)),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(gInfo?['name'] ?? "Gift", style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (sender != null && _activeGiftTab == 0)
                    Text("by ${sender['display_name']}", style: const TextStyle(color: Colors.white24, fontSize: 8), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showGiftDetailModal(Map<String, dynamic> gift) {
    final gInfo = gift['gifts'] as Map<String, dynamic>?;
    final sender = gift['sender'] as Map<String, dynamic>?;
    final receiver = gift['receiver'] as Map<String, dynamic>?;
    final person = _activeGiftTab == 0 ? sender : receiver;
    final String label = _activeGiftTab == 0 ? "Sender Info" : "Receiver Info";

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Text(label, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            if (person != null) ...[
              ListTile(
                leading: CircleAvatar(backgroundImage: NetworkImage(person['avatar_url'] ?? '')),
                title: Text(person['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                subtitle: Text("UID: ${person['app_uid'] ?? '---'}", style: const TextStyle(color: Colors.white38)),
                trailing: TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.push(context, MaterialPageRoute(builder: (_) => ProfileDetailScreen(userId: person['id'] ?? '')));
                  },
                  child: const Text("View Profile"),
                ),
              ),
            ],
            const SizedBox(height: 16),
            const Divider(color: Colors.white10),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(width: 50, height: 50, decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)), child: CachedNetworkImage(imageUrl: gInfo?['icon_url'] ?? '')),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(gInfo?['name'] ?? 'Gift', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("Amount: ${gift['coin_amount']} Diamonds", style: const TextStyle(color: Colors.amber, fontSize: 12)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: Colors.amber, size: 14),
        const SizedBox(width: 8),
        Text(title, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
      ],
    );
  }

  Widget _buildAssetBox(IconData icon, int amount, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 12),
            Text(_api.formatNumber(amount), style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10)),
          ],
        ),
      ),
    );
  }
}

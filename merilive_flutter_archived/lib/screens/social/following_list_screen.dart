import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/premium_avatar.dart';
import '../premium_private_call_screen.dart';

class FollowingListScreen extends StatefulWidget {
  const FollowingListScreen({super.key});

  @override
  State<FollowingListScreen> createState() => _FollowingListScreenState();
}

class _FollowingListScreenState extends State<FollowingListScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  
  List<Map<String, dynamic>> _following = [];
  List<Map<String, dynamic>> _followers = [];
  List<Map<String, dynamic>> _friends = [];
  Set<String> _followingIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getFollowingWithProfiles(),
        _api.getFollowersWithProfiles(),
        _api.getFriendsWithProfiles(),
      ]);

      _following = List<Map<String, dynamic>>.from(results[0]);
      _followers = List<Map<String, dynamic>>.from(results[1]);
      _friends = List<Map<String, dynamic>>.from(results[2]);
      
      _followingIds = _following.map((f) => f['profile']['id'].toString()).toSet();

      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Error loading follow data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleFollowToggle(String profileId) async {
    bool success;
    if (_followingIds.contains(profileId)) {
      success = await _api.unfollowUser(profileId);
      if (success) {
        setState(() {
          _followingIds.remove(profileId);
          _following.removeWhere((f) => f['profile']['id'] == profileId);
          _friends.removeWhere((f) => f['profile']['id'] == profileId);
        });
      }
    } else {
      success = await _api.followUser(profileId);
      if (success) {
        _loadData(); // Refresh to get profile info for new follow
      }
    }
  }

  void _startCall(Map<String, dynamic> peer) {
    if (peer['host_availability'] != 'online' && peer['is_online'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Host is currently offline")));
      return;
    }
    
    final roomId = "call_${_api.currentUserId}_${peer['id']}_${DateTime.now().millisecondsSinceEpoch}";
    
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => PremiumPrivateCallScreen(
          peerData: peer,
          roomId: roomId,
          isHost: false,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          "FOLLOWING & FRIENDS",
          style: GoogleFonts.outfit(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w900,
            letterSpacing: 1,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFEC4899),
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white38,
          labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
          tabs: [
            Tab(text: "FOLLOWING (${_following.length})"),
            Tab(text: "FOLLOWERS (${_followers.length})"),
            Tab(text: "FRIENDS (${_friends.length})"),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFEC4899)))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildList(_following, "following"),
                _buildList(_followers, "followers"),
                _buildList(_friends, "friends"),
              ],
            ),
    );
  }

  Widget _buildList(List<Map<String, dynamic>> items, String type) {
    if (items.isEmpty) {
      return _buildEmptyState(type);
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return _buildUserCard(item, type);
      },
    );
  }

  Widget _buildUserCard(Map<String, dynamic> item, String type) {
    final profile = item['profile'];
    final bool isOnline = profile['is_online'] ?? false;
    final bool isVerified = profile['is_verified'] ?? false;
    final bool isHost = profile['is_host'] ?? false;
    final String profileId = profile['id'];
    final bool isFollowing = _followingIds.contains(profileId);

    return FadeInUp(
      duration: const Duration(milliseconds: 300),
      child: Container(
        margin: const EdgeInsets.bottom(12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            GestureDetector(
              onTap: () => Navigator.pushNamed(context, '/profile_detail', arguments: profileId),
              child: Stack(
                children: [
                  AvatarWithFrame(
                    userId: profileId,
                    src: profile['avatar_url'],
                    size: 56,
                    isVerified: isVerified,
                  ),
                  if (isOnline)
                    Positioned(
                      bottom: 2,
                      right: 2,
                      child: Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFF0F172A), width: 2),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          profile['display_name'] ?? 'User',
                          style: GoogleFonts.outfit(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isHost)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEC4899).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            "HOST",
                            style: GoogleFonts.outfit(
                              color: const Color(0xFFEC4899),
                              fontSize: 8,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        profile['country_flag'] ?? '🏳️',
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isOnline ? "Online" : "Offline",
                        style: GoogleFonts.outfit(
                          color: isOnline ? Colors.greenAccent : Colors.white38,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Row(
              children: [
                if (isHost && isOnline)
                  IconButton(
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.phone, color: Colors.green, size: 18),
                    ),
                    onPressed: () => _startCall(profile),
                  ),
                const SizedBox(width: 4),
                ElevatedButton(
                  onPressed: () => _handleFollowToggle(profileId),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isFollowing ? Colors.white.withOpacity(0.05) : const Color(0xFFEC4899),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    side: isFollowing ? BorderSide(color: Colors.white.withOpacity(0.1)) : BorderSide.none,
                  ),
                  child: Text(
                    isFollowing ? "FOLLOWING" : "FOLLOW",
                    style: GoogleFonts.outfit(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(String type) {
    IconData icon;
    String title;
    String subTitle;

    if (type == 'following') {
      icon = LucideIcons.heart;
      title = "Not following anyone yet";
      subTitle = "Discover and follow hosts you like!";
    } else if (type == 'friends') {
      icon = LucideIcons.users;
      title = "No friends yet";
      subTitle = "Friends are people you follow who follow you back.";
    } else {
      icon = LucideIcons.userPlus;
      title = "No followers yet";
      subTitle = "Share your profile to get more followers!";
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 48, color: Colors.white24),
          ),
          const SizedBox(height: 24),
          Text(
            title,
            style: GoogleFonts.outfit(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Text(
              subTitle,
              textAlign: TextAlign.center,
              style: GoogleFonts.outfit(
                color: Colors.white38,
                fontSize: 14,
              ),
            ),
          ),
          if (type == 'following') ...[
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/discover'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEC4899),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: const Text("DISCOVER HOSTS", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ],
      ),
    );
  }
}

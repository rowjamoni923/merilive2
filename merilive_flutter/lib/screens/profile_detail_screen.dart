import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/api_service.dart';
import '../widgets/avatar_with_frame.dart';
import '../widgets/vip_badge.dart';

class ProfileDetailScreen extends StatefulWidget {
  final String userId;
  const ProfileDetailScreen({super.key, required this.userId});

  @override
  State<ProfileDetailScreen> createState() => _ProfileDetailScreenState();
}

class _ProfileDetailScreenState extends State<ProfileDetailScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _posterImages = [];
  int _currentSlideIndex = 0;
  PageController _pageController = PageController();
  
  int _followersCount = 0;
  int _followingCount = 0;
  bool _isFollowing = false;
  bool _isHost = false;
  String _gender = 'male';
  Map<String, dynamic>? _subscription;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Parallel Fetch
      final results = await Future.wait([
        supa.from('profiles').select().eq('id', widget.userId).maybeSingle(),
        supa.from('poster_images').select().eq('user_id', widget.userId).order('display_order'),
        supa.from('followers').select('id', const CountOption.exact()).eq('following_id', widget.userId),
        supa.from('followers').select('id', const CountOption.exact()).eq('follower_id', widget.userId),
        supa.from('followers').select('id').eq('follower_id', _api.currentUserId!).eq('following_id', widget.userId).maybeSingle(),
        _api.getUserVIPSubscription(userId: widget.userId),
      ]);

      if (mounted) {
        _profile = results[0] as Map<String, dynamic>?;
        _posterImages = List<Map<String, dynamic>>.from(results[1] ?? []);
        _followersCount = (results[2] as PostgrestResponse).count ?? 0;
        _followingCount = (results[3] as PostgrestResponse).count ?? 0;
        _isFollowing = results[4] != null;
        _subscription = results[5] as Map<String, dynamic>?;
        
        _isHost = _profile?['is_host'] ?? false;
        _gender = (_profile?['gender'] ?? 'male').toString().toLowerCase();

        _isLoading = false;
        setState(() {});
      }
    } catch (e) {
      debugPrint("Error loading profile detail: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0C0515), body: Center(child: CircularProgressIndicator(color: Color(0xFFEC4899))));
    }

    if (_profile == null) {
      return const Scaffold(backgroundColor: Color(0xFF0C0515), body: Center(child: Text("Profile not found", style: TextStyle(color: Colors.white))));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0C0515),
      body: Stack(
        children: [
          // 1. Poster Slideshow
          _buildSlideshow(),

          // 2. Main Content (Scrollable)
          _buildContent(),

          // 3. Bottom Action Bar
          _buildBottomActions(),

          // 4. Back Button
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 20,
            child: GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), shape: BoxShape.circle),
                child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 24),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSlideshow() {
    if (_posterImages.isEmpty) {
      return Container(
        height: MediaQuery.of(context).size.height * 0.5,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: NetworkImage(_profile?['avatar_url'] ?? ""),
            fit: BoxFit.cover,
          ),
        ),
        child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20), child: Container(color: Colors.black.withOpacity(0.3))),
      );
    }

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.5,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            onPageChanged: (idx) => setState(() => _currentSlideIndex = idx),
            itemCount: _posterImages.length,
            itemBuilder: (context, index) {
              return Image.network(_posterImages[index]['image_url'], fit: BoxFit.cover);
            },
          ),
          Positioned(
            bottom: 60, left: 0, right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_posterImages.length, (idx) => Container(
                width: 6, height: 6,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(shape: BoxShape.circle, color: _currentSlideIndex == idx ? Colors.white : Colors.white.withOpacity(0.3)),
              )),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter, end: Alignment.bottomCenter,
                colors: [Colors.transparent, const Color(0xFF0C0515).withOpacity(0.8), const Color(0xFF0C0515)],
                stops: const [0.6, 0.9, 1.0],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.42),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header Info
                Row(
                  children: [
                    AvatarWithFrame(
                      userId: _profile!['id'],
                      src: _profile!['avatar_url'],
                      size: 80,
                      level: _profile!['user_level'] ?? 1,
                      isHost: _isHost,
                      isVerified: _profile!['is_face_verified'] ?? false,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(_profile!['display_name'] ?? 'User', style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                              if (_subscription != null) ...[
                                const SizedBox(width: 8),
                                VIPBadge(tier: (_subscription!['vip_tiers']?['tier_level'] as num?)?.toInt() ?? 0, size: 'xs'),
                              ],
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text("ID: ${_profile!['app_uid']}", style: GoogleFonts.spaceMono(color: Colors.white.withOpacity(0.5), fontSize: 13)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Offline Message (Premium Badge)
                if (_profile!['offline_message'] != null && _profile!['offline_message'].toString().isNotEmpty)
                  FadeIn(
                    child: Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 24),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.08)),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.messageCircle, color: Colors.blueAccent, size: 16),
                          const SizedBox(width: 10),
                          Expanded(child: Text(_profile!['offline_message'], style: GoogleFonts.inter(color: Colors.white70, fontSize: 13, fontStyle: FontStyle.italic))),
                        ],
                      ),
                    ),
                  ),

                // Identity Tags
                Row(
                  children: [
                    _identityTag(LucideIcons.globe, _profile!['country_name'] ?? "Bangladesh", const Color(0xFF10B981)),
                    const SizedBox(width: 8),
                    if (!(_profile!['hide_location'] ?? false)) ...[
                      _identityTag(LucideIcons.mapPin, _profile!['district'] ?? "Location", Colors.white.withOpacity(0.4)),
                      const SizedBox(width: 8),
                    ],
                    _identityTag(LucideIcons.languages, _profile!['language'] ?? "Bengali", const Color(0xFFF59E0B)),
                  ],
                ),
                const SizedBox(height: 24),

                // Stats
                Row(
                  children: [
                    _statBlock(_followersCount, "Followers"),
                    const SizedBox(width: 32),
                    _statBlock(_followingCount, "Following"),
                  ],
                ),
                const SizedBox(height: 24),

                // Bio
                Text("Bio", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.3), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                const SizedBox(height: 8),
                Text(_profile!['bio'] ?? "No bio yet.", style: GoogleFonts.inter(color: Colors.white.withOpacity(0.8), fontSize: 14, height: 1.5)),
                
                const SizedBox(height: 32),
                
                // Tags
                if ((_profile!['tags'] as List?)?.isNotEmpty == true) ...[
                  Text("Interests", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.3), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 10, runSpacing: 10,
                    children: (_profile!['tags'] as List).map((t) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
                      child: Text(t.toString(), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    )).toList(),
                  ),
                ],

                const SizedBox(height: 120),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _identityTag(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.15))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 10),
          const SizedBox(width: 6),
          Text(label, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _statBlock(int val, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(_api.formatNumber(val), style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.4), fontSize: 12)),
      ],
    );
  }

  Widget _buildBottomActions() {
    return Positioned(
      bottom: 0, left: 0, right: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, const Color(0xFF0C0515).withOpacity(0.9), const Color(0xFF0C0515)]),
        ),
        child: Row(
          children: [
            // Chat
            _actionBtn(LucideIcons.messageSquare, "Chat", const Color(0xFFEC4899).withOpacity(0.1), const Color(0xFFEC4899), () => Navigator.pushNamed(context, '/chat', arguments: widget.userId)),
            const SizedBox(width: 12),
            // Call
            if (_isHost && _gender == 'female') ...[
              Expanded(
                child: Container(
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFFBE185D)]),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(color: const Color(0xFFEC4899).withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: () => _handleCall(),
                      borderRadius: BorderRadius.circular(20),
                      child: const Center(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(LucideIcons.phone, color: Colors.white, size: 20), SizedBox(width: 10), Text("Video Call", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16))])),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
            ],
            // Follow
            _actionBtn(_isFollowing ? LucideIcons.userCheck : LucideIcons.userPlus, _isFollowing ? "Following" : "Follow", Colors.white.withOpacity(0.05), Colors.white, () => _handleFollow()),
          ],
        ),
      ),
    );
  }

  Widget _actionBtn(IconData icon, String label, Color bg, Color tint, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20), border: Border.all(color: tint.withOpacity(0.1))),
        child: Row(children: [Icon(icon, color: tint, size: 20), const SizedBox(width: 8), Text(label, style: TextStyle(color: tint, fontWeight: FontWeight.bold))]),
      ),
    );
  }

  void _handleCall() {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Calling feature coming soon!")));
  }

  void _handleFollow() async {
    setState(() => _isFollowing = !_isFollowing);
    try {
      final supa = _api.getSupabase();
      if (_isFollowing) {
        await supa.from('followers').insert({'follower_id': _api.currentUserId!, 'following_id': widget.userId});
      } else {
        await supa.from('followers').delete().eq('follower_id', _api.currentUserId!).eq('following_id', widget.userId);
      }
    } catch (e) {
      debugPrint("Error following: $e");
    }
  }
}

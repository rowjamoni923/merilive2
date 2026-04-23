import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';
import '../widgets/avatar_with_frame.dart';
import '../widgets/level_badge.dart';
import 'room/live_room_screen.dart';
import 'package:video_player/video_player.dart';
import 'package:marquee/marquee.dart';
import 'package:flutter/services.dart';
import 'dart:ui';

class ReelsScreen extends StatefulWidget {
  const ReelsScreen({super.key});

  @override
  State<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends State<ReelsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _reels = [];
  List<Map<String, dynamic>> _categories = [];
  String _selectedCategory = 'all';
  int _currentIndex = 0;
  
  Map<int, VideoPlayerController> _controllers = {};
  bool _isMuted = false;

  @override
  void initState() {
    super.initState();
    _loadReels();
  }

  @override
  void dispose() {
    _controllers.values.forEach((c) => c.dispose());
    super.dispose();
  }

  Future<void> _loadReels() async {
    if (_reels.isEmpty) setState(() => _isLoading = true);
    try {
      if (_categories.isEmpty) {
        _categories = await _api.getReelCategories();
      }
      
      final data = await _api.getReels(categoryId: _selectedCategory);
      
      // Cleanup old controllers
      _controllers.values.forEach((c) => c.dispose());
      _controllers.clear();

      if (mounted) {
        setState(() {
          _reels = data;
          _isLoading = false;
        });
        
        if (_reels.isNotEmpty) {
          _initController(0);
        }
      }
    } catch (e) {
      debugPrint("Error loading reels: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _initController(int index) async {
    if (index < 0 || index >= _reels.length) return;
    if (_controllers.containsKey(index)) return;

    final reel = _reels[index];
    final controller = VideoPlayerController.networkUrl(Uri.parse(reel['video_url']));
    _controllers[index] = controller;

    await controller.initialize();
    controller.setLooping(true);
    controller.setVolume(_isMuted ? 0 : 1.0);
    
    if (index == _currentIndex) {
      controller.play();
    }
    
    if (mounted) setState(() {});
  }

  void _onPageChanged(int index) {
    // Pause previous
    _controllers[_currentIndex]?.pause();
    
    setState(() {
      _currentIndex = index;
    });

    // Play current or init
    if (_controllers.containsKey(index)) {
      _controllers[index]!.play();
    } else {
      _initController(index);
    }

    // Pre-init next
    if (index + 1 < _reels.length) {
      _initController(index + 1);
    }
  }

  void _toggleMute() {
    setState(() => _isMuted = !_isMuted);
    _controllers.values.forEach((c) => c.setVolume(_isMuted ? 0 : 1.0));
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator(color: Color(0xFF6366F1))));
    }

    if (_reels.isEmpty) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.videoOff, color: Colors.white24, size: 80),
              const SizedBox(height: 16),
              Text("No reels available yet.", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 16)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            scrollDirection: Axis.vertical,
            physics: const BouncingScrollPhysics(),
            itemCount: _reels.length,
            onPageChanged: _onPageChanged,
            itemBuilder: (context, index) {
              return _buildReelView(_reels[index], index == _currentIndex, index);
            },
          ),
          
          _buildHeaderOverlay(),

          if (_reels.isNotEmpty && (_reels[_currentIndex]['beans_earned'] ?? 0) > 0)
            Positioned(
              top: MediaQuery.of(context).padding.top + 70,
              left: 16,
              child: FadeInLeft(
                duration: const Duration(milliseconds: 500),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)]),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.3), blurRadius: 10)],
                    border: Border.all(color: Colors.amber.withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(LucideIcons.coins, color: Colors.white, size: 12),
                      const SizedBox(width: 4),
                      Text(
                        "${_reels[_currentIndex]['beans_earned']}",
                        style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildHeaderOverlay() {
    return Positioned(
      top: 0, left: 0, right: 0,
      child: Container(
        padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.black.withOpacity(0.8), Colors.transparent],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("Reels", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, '/create_reel'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.plus, color: Colors.white, size: 14),
                          const SizedBox(width: 4),
                          Text("Upload", style: GoogleFonts.outfit(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 36,
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                itemCount: _categories.length + 1,
                itemBuilder: (ctx, i) {
                  final String slug = i == 0 ? 'all' : _categories[i-1]['slug'];
                  final String name = i == 0 ? 'For You' : _categories[i-1]['name'];
                  final isSelected = _selectedCategory == slug;
                  
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      setState(() {
                         _selectedCategory = slug;
                         _reels = [];
                      });
                      _loadReels();
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.white : Colors.black.withOpacity(0.4),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: isSelected ? Colors.white : Colors.white.withOpacity(0.2)),
                        boxShadow: isSelected ? [BoxShadow(color: Colors.white.withOpacity(0.3), blurRadius: 10)] : [],
                      ),
                      child: Text(
                        name,
                        style: GoogleFonts.outfit(
                          color: isSelected ? Colors.black : Colors.white.withOpacity(0.9),
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReelView(Map<String, dynamic> reel, bool isActive, int index) {
    final controller = _controllers[index];
    final user = reel['user'] ?? {};

    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          onDoubleTap: () {
            HapticFeedback.heavyImpact();
            if (reel['is_liked'] != true) {
               _api.updateLikeCount(reel['id'], (reel['likes_count'] ?? 0).toString());
               setState(() {
                 reel['is_liked'] = true;
                 reel['likes_count'] = (reel['likes_count'] ?? 0) + 1;
               });
            }
          },
          onTap: () {
            if (controller != null) {
              if (controller.value.isPlaying) controller.pause();
              else controller.play();
              setState(() {});
            }
          },
          child: Container(
            color: Colors.black,
            child: (controller != null && controller.value.isInitialized)
              ? Center(
                  child: AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  ),
                )
              : Center(child: CircularProgressIndicator(color: Colors.white.withOpacity(0.3))),
          ),
        ),
        
        if (controller != null && !controller.value.isPlaying)
          Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), shape: BoxShape.circle),
              child: const Icon(LucideIcons.playCircle, color: Colors.white, size: 64),
            ),
          ),

        Positioned(
          bottom: 0, left: 0, right: 0,
          height: 350,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.transparent, Colors.black.withOpacity(0.5), Colors.black.withOpacity(0.9)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
        ),

        Positioned(
          bottom: 20 + MediaQuery.of(context).padding.bottom,
          left: 16, right: 90,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
               GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.pushNamed(context, '/profile_detail', arguments: user['id']);
                },
                child: Row(
                  children: [
                     AvatarWithFrame(
                       src: user['avatar_url'], 
                       size: 24, 
                       userId: user['id'] ?? "", 
                       name: user['display_name'] ?? "",
                       isVerified: user['is_verified'] == true,
                     ),
                     const SizedBox(width: 12),
                     Expanded(
                       child: Column(
                         crossAxisAlignment: CrossAxisAlignment.start,
                         children: [
                           Row(
                             children: [
                               Flexible(
                                 child: Text(
                                   "@${user['display_name'] ?? 'user'}",
                                   style: GoogleFonts.outfit(
                                     color: Colors.white, 
                                     fontSize: 15, 
                                     fontWeight: FontWeight.w900, 
                                     letterSpacing: -0.2,
                                     shadows: [const Shadow(color: Colors.black, blurRadius: 8)],
                                   ),
                                   maxLines: 1, overflow: TextOverflow.ellipsis,
                                 ),
                               ),
                               const SizedBox(width: 8),
                               LevelBadge(level: user['user_level'] ?? 1, size: 'xs'),
                               const SizedBox(width: 8),
                               GestureDetector(
                                 onTap: () {
                                    HapticFeedback.mediumImpact();
                                    // [NEW] Follow logic parity
                                 },
                                 child: Container(
                                   padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                   decoration: BoxDecoration(
                                     color: Colors.white.withOpacity(0.15),
                                     borderRadius: BorderRadius.circular(20),
                                     border: Border.all(color: Colors.white.withOpacity(0.2)),
                                   ),
                                   child: const Text("Follow", style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                 ),
                               ),
                             ],
                           ),
                         ],
                       ),
                     ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                reel['caption'] ?? '',
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, height: 1.4, fontWeight: FontWeight.normal),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Icon(LucideIcons.music, color: Colors.white70, size: 14),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 18,
                      child: Marquee(
                        text: "${reel['music_title'] ?? 'Original Sound'} - ${user['display_name'] ?? 'Unknown'}",
                        style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
                        scrollAxis: Axis.horizontal,
                        blankSpace: 50.0,
                        velocity: 40.0,
                        pauseAfterRound: const Duration(seconds: 1),
                        startPadding: 10.0,
                        accelerationDuration: const Duration(seconds: 1),
                        accelerationCurve: Curves.linear,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        Positioned(
          right: 12, bottom: 20 + MediaQuery.of(context).padding.bottom,
          child: Column(
            children: [
              _buildInteraction(
                icon: LucideIcons.heart,
                label: "${reel['likes_count'] ?? 0}",
                isActive: reel['is_liked'] == true,
                activeColor: const Color(0xFFEF4444),
                onTap: () async {
                  HapticFeedback.heavyImpact();
                  await _api.updateLikeCount(reel['id'], (reel['likes_count'] ?? 0).toString());
                  setState(() => reel['is_liked'] = !(reel['is_liked'] == true));
                },
              ),
              const SizedBox(height: 20),
              _buildInteraction(
                icon: LucideIcons.messageCircle,
                label: "${reel['comment_count'] ?? 0}",
                onTap: () {},
              ),
              const SizedBox(height: 20),
              _buildInteraction(
                icon: LucideIcons.share2,
                label: "Share",
                onTap: () {
                  HapticFeedback.mediumImpact();
                  final shareUrl = "https://merilive.com/link?target=/reels/${reel['id']}";
                  Clipboard.setData(ClipboardData(text: shareUrl));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: const Text("Copied share link to clipboard!"),
                      backgroundColor: Colors.indigo,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  );
                },
              ),
              const SizedBox(height: 25),
              _buildGiftButton(),
              const SizedBox(height: 25),
              GestureDetector(
                onTap: _toggleMute,
                child: Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.1), 
                    shape: BoxShape.circle, 
                    border: Border.all(color: Colors.white.withOpacity(0.15)),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 10)],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(30),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                      child: Center(
                        child: Icon(_isMuted ? LucideIcons.volumeX : LucideIcons.volume2, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              _buildInteraction(
                icon: LucideIcons.moreVertical,
                label: "",
                onTap: () {},
              ),
              const SizedBox(height: 20),
              const _SpinningDisk(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInteraction({required IconData icon, required String label, bool isActive = false, Color? activeColor, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Icon(
            icon, 
            color: isActive ? activeColor : Colors.white, 
            size: 32,
            shadows: [Shadow(color: Colors.black.withOpacity(0.5), blurRadius: 10, offset: const Offset(0, 2))],
          ),
          const SizedBox(height: 4),
          Text(
            label, 
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold, shadows: [const Shadow(color: Colors.black, blurRadius: 4)]),
          ),
        ],
      ),
    );
  }

  Widget _buildGiftButton() {
    return GestureDetector(
      onTap: () {},
      child: Column(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Pulse(
                child: Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(colors: [Color(0xFFF43F5E), Color(0xFFD946EF)]),
                    boxShadow: [BoxShadow(color: const Color(0xFFF43F5E).withOpacity(0.6), blurRadius: 20)],
                  ),
                ),
              ),
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(colors: [Color(0xFFF43F5E), Color(0xFFEC4899), Color(0xFFD946EF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  border: Border.all(color: Colors.white.withOpacity(0.4)),
                ),
                child: const Icon(LucideIcons.gift, color: Colors.white, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text("Gift", style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _SpinningDisk extends StatefulWidget {
  const _SpinningDisk();
  @override
  State<_SpinningDisk> createState() => _SpinningDiskState();
}

class _SpinningDiskState extends State<_SpinningDisk> with SingleTickerProviderStateMixin {
  late AnimationController _anim;
  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
  }
  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _anim,
      child: Container(
        width: 38, height: 38,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(colors: [Color(0xFF1F2937), Color(0xFF111827)]),
          border: Border.all(color: Colors.grey.withOpacity(0.3), width: 2),
        ),
        child: Container(
          decoration: BoxDecoration(color: Colors.black.withOpacity(0.5), shape: BoxShape.circle),
          child: const Icon(LucideIcons.music, color: Colors.white30, size: 12),
        ),
      ),
    );
  }
}

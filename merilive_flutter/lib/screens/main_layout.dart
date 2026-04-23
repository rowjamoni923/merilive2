import 'package:flutter/material.dart';
import 'dart:ui';
import 'package:lucide_icons/lucide_icons.dart';
import 'home_screen.dart';
import 'discover_screen.dart';
import 'profile_screen.dart';
import 'reels_screen.dart';
import 'room/create_party_screen.dart';
import 'room/create_live_screen.dart';
import '../services/auth_service.dart';
import 'package:provider/provider.dart';
import 'package:flutter/services.dart';
import 'package:animate_do/animate_do.dart';
import '../widgets/recharge_campaign_floating_button.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/api_service.dart';
import '../services/admin_controller_service.dart';

class MainLayout extends StatefulWidget {
  final int initialIndex;
  const MainLayout({super.key, this.initialIndex = 0});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> with SingleTickerProviderStateMixin {
  late int _currentIndex;
  bool _isCreateMenuOpen = false;
  late AnimationController _animationController;
  late Animation<double> _rotationAnimation;
  
  // OTP Banner State
  bool _isOtpBannerVisible = false;
  String? _otpMessage;
  String? _otpCode;

  final List<Widget> _pages = [
    const HomeScreen(),
    const DiscoverScreen(),
    const ReelsScreen(),
    const ProfileScreen(),
  ];

  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );
    _rotationAnimation = Tween<double>(begin: 0, end: 0.125).animate( // 45 degrees
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );
    _setupOtpListener();
    _fetchUnreadCount();
  }

  void _setupOtpListener() {
    final supabase = Provider.of<ApiService>(context, listen: false).getSupabase();
    final user = supabase.auth.currentUser;
    if (user == null) return;

    supabase
        .channel('public:notifications:otp')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: user.id,
          ),
          callback: (payload) {
            final data = payload.newRecord;
            if (data != null && data['type'] == 'otp') {
              _showOtpBanner(data['content'], data['metadata']?['code']);
            }
          },
        )
        .subscribe();
  }

  void _showOtpBanner(String message, String? code) {
    if (!mounted) return;
    setState(() {
      _otpMessage = message;
      _otpCode = code;
      _isOtpBannerVisible = true;
    });
    
    // Auto-hide after 10 seconds
    Future.delayed(const Duration(seconds: 10), () {
      if (mounted) setState(() => _isOtpBannerVisible = false);
    });
  }

  Future<void> _fetchUnreadCount() async {
     try {
       // Mocking unread fetch to match web parity
       setState(() => _unreadCount = 5); 
     } catch (e) {
       debugPrint("Failed to fetch unread count: $e");
     }
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  void _toggleCreateMenu() {
    HapticFeedback.heavyImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => const CreateBottomSheet(),
    );
  }

  Future<void> _handleAction(String featureKey, Widget targetScreen) async {
    HapticFeedback.mediumImpact();
    
    // Toggle menu closed first for smooth UX
    _toggleCreateMenu();

    final admin = Provider.of<AdminControllerService>(context, listen: false);
    final api = ApiService();
    final profile = await api.getMyProfile();
    
    if (profile == null) return;

    final int currentLevel = profile['user_level'] ?? 1;
    final bool isHost = profile['is_host'] == true;

    final access = admin.canAccessFeature(featureKey, currentLevel, isHost);

    if (access.canAccess) {
      if (!mounted) return;
      Navigator.push(context, MaterialPageRoute(builder: (context) => targetScreen));
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(LucideIcons.lock, color: Colors.white, size: 16),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    "Level ${access.requiredLevel} required. Your level: ${access.currentLevel}. Keep joining rooms to level up!",
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            margin: const EdgeInsets.all(20),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      extendBody: true,
      body: Stack(
        children: [
          IndexedStack(
            index: _currentIndex,
            children: _pages,
          ),
          
          // --- OTP NOTIFICATION BANNER (In-App Parity) ---
          if (_isOtpBannerVisible)
            Positioned(
              top: MediaQuery.of(context).padding.top + 10,
              left: 16, right: 16,
              child: FadeInDown(
                duration: const Duration(milliseconds: 500),
                child: GestureDetector(
                  onTap: () {
                    if (_otpCode != null) {
                      Clipboard.setData(ClipboardData(text: _otpCode!));
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Code copied to clipboard!")));
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF1E293B), Color(0xFF0F172A)]),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.5)),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 20, offset: const Offset(0, 10))],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(color: const Color(0xFF3B82F6).withOpacity(0.1), shape: BoxShape.circle),
                          child: const Icon(LucideIcons.shieldCheck, color: Color(0xFF3B82F6), size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text("Verification Code", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                              Text(_otpMessage ?? "", style: const TextStyle(color: Colors.white70, fontSize: 11)),
                            ],
                          ),
                        ),
                        const Icon(LucideIcons.copy, color: Colors.white38, size: 16),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          
          // Floating Web Parity Campaign
          const Positioned(
            bottom: 0, 
            right: 0,
            child: RechargeCampaignFloatingButton(),
          ),
          
          // Floating Web Parity Campaign
          const Positioned(
            bottom: 0, 
            right: 0,
            child: RechargeCampaignFloatingButton(),
          ),
        ],
      ),
      bottomNavigationBar: Stack(
        alignment: Alignment.bottomCenter,
        clipBehavior: Clip.none,
        children: [
          // 1. Seamless Gradient Fade (Web Parity)
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: Container(
              height: 90 + MediaQuery.of(context).padding.bottom,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.85),
                  ],
                ),
              ),
            ),
          ),
          
          // 2. Main Navigation Bar with Heavy Blur
          ClipRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
              child: Container(
                height: 75 + MediaQuery.of(context).padding.bottom,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.4), // Lower opacity because blur + gradient background
                ),
                child: Padding(
                  padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildNavItem(0, LucideIcons.home, "Home"),
                      _buildNavItem(1, LucideIcons.users, "Party"),
                      const SizedBox(width: 52), // Custom Gap for Center Button
                      _buildNavItem(2, LucideIcons.playSquare, "Reels"),
                      _buildNavItem(3, LucideIcons.user, "Profile", hasBadge: true),
                    ],
                  ),
                ),
              ),
            ),
          ),
          
          // 3. Floating Center Action Button (Redesigned)
          Positioned(
            bottom: 35 + MediaQuery.of(context).padding.bottom,
            child: GestureDetector(
              onTap: () {
                HapticFeedback.heavyImpact();
                _toggleCreateMenu();
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RotationTransition(
                    turns: _rotationAnimation,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Web Parity Glow
                        Container(
                          width: 52, height: 52,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFFA855F7).withOpacity(0.35),
                                blurRadius: 25,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 52, height: 52,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              colors: [Color(0xFFD946EF), Color(0xFF7C3AED), Color(0xFF4F46E5)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            // Web Parity Ring
                            border: Border.all(color: Colors.black.withOpacity(0.8), width: 3),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF9333EA).withOpacity(0.5),
                                blurRadius: 24,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Stack(
                            children: [
                              Positioned(
                                top: 2, left: 2,
                                child: Container(
                                  width: 25, height: 25,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: LinearGradient(
                                      colors: [Colors.white.withOpacity(0.25), Colors.transparent],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                  ),
                                ),
                              ),
                              Center(
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 200),
                                  child: _isCreateMenuOpen 
                                    ? const Icon(LucideIcons.x, color: Colors.white, size: 20, key: ValueKey('x'))
                                    : const Icon(LucideIcons.plus, color: Colors.white, size: 24, key: ValueKey('plus')),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Create",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.5),
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionMenuButton({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> colors,
    required VoidCallback onTap,
    Widget? trailing,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: colors,
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.2)),
          boxShadow: [
            BoxShadow(
              color: colors[1].withOpacity(0.5),
              blurRadius: 20,
              offset: const Offset(0, 8),
            )
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.8),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            if (trailing != null) trailing,
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon, String label, {bool hasBadge = false}) {
    final isSelected = _currentIndex == index;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.lightImpact();
        if (_isCreateMenuOpen) _toggleCreateMenu();
        setState(() => _currentIndex = index);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  icon, 
                  color: isSelected ? Colors.white : Colors.white.withOpacity(0.4), 
                  size: 22
                ),
                if (hasBadge && _unreadCount > 0)
                  Positioned(
                    top: -2,
                    right: -2,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 16),
                      height: 16,
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFEC4899)]),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.black, width: 2),
                      ),
                      child: Center(
                        child: Text(
                          _unreadCount > 9 ? "9+" : "$_unreadCount",
                          style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white.withOpacity(0.35),
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}



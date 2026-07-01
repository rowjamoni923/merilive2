import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';
import '../widgets/premium_live_card.dart';
import 'dart:ui';

import '../widgets/event_popup_banner.dart';
import '../widgets/rating_promo_banner.dart';
import '../widgets/rating_proof_dialog.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import '../services/admin_controller_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin, WidgetsBindingObserver {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  String _activeTab = 'popular'; // popular, live, new, follow
  String _selectedCountry = 'all';

  List<Map<String, dynamic>> _displayHosts = [];
  List<Map<String, String>> _countries = [
    {'code': 'all', 'name': 'All', 'flag': '🌍'},
  ];

  late AnimationController _pulseController;
  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    
    WidgetsBinding.instance.addObserver(this);
    
    _loadCountries();
    _loadHosts();
    _loadBanners();
    _setupRealtimeStatusListener();
    
    // Web Parity: 40 second Rating Promo delay
    
    // Web Parity: 40 second Rating Promo delay
    Future.delayed(const Duration(seconds: 40), () async {
      if (!mounted) return;
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool('rating_popup_dismissed') != true && 
          prefs.getBool('rating_reward_return_pending') != true) {
         showDialog(
           context: context,
           builder: (_) => const RatingPromoBanner(),
           barrierColor: Colors.transparent,
           useSafeArea: false,
         );
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkPendingRatingProof();
    }
  }

  Future<void> _checkPendingRatingProof() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('rating_reward_return_pending') == true) {
      if (mounted) {
        showDialog(
          context: context,
          builder: (_) => const RatingProofDialog(),
          barrierColor: Colors.black87,
        );
      }
    }
  }

  @override
  void dispose() {
    _realtimeChannel?.unsubscribe();
    WidgetsBinding.instance.removeObserver(this);
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _loadCountries() async {
    try {
      final supabase = _api.getSupabase();
      final res = await supabase
          .from('profiles')
          .select('country_code, country_flag')
          .eq('is_host', true)
          .eq('gender', 'female')
          .not('country_code', 'is', null)
          .not('country_flag', 'is', null);

      final Map<String, String> uniqueCountries = {};
      for (var row in res) {
        String code = row['country_code'];
        String flag = row['country_flag'];
        if (flag != 'NONE') uniqueCountries[code] = flag;
      }
      
      final List<Map<String, String>> cList = [
         {'code': 'all', 'name': 'All', 'flag': '🌍'},
      ];
      uniqueCountries.forEach((code, flag) {
         cList.add({'code': code, 'name': code.toUpperCase(), 'flag': flag});
      });
      if (mounted) setState(() => _countries = cList);
    } catch (_) {}
  }

  List<Map<String, dynamic>> _topBanners = [];
  List<Map<String, dynamic>> _middleBanners = [];

  Future<void> _loadBanners() async {
    try {
      final activeBanners = await _api.getActiveBanners();
      
      if (mounted) {
        setState(() {
          if (activeBanners.isNotEmpty) {
            // Level 1: First banner in order (Top)
            _topBanners = [activeBanners.first];
            // Level 2: Remaining banners (Interleaved after 6 cards)
            _middleBanners = activeBanners.length > 1 ? activeBanners.sublist(1) : [];
          } else {
            _topBanners = [];
            _middleBanners = [];
          }
        });
      }
    } catch (_) {}
  }

  Future<void> _loadHosts() async {
    setState(() => _isLoading = true);
    await _loadBanners();
    try {
      final hostsWithStatus = await _api.getHomeHosts(
        activeTab: _activeTab,
        selectedCountry: _selectedCountry,
      );
      if (mounted) setState(() => _displayHosts = hostsWithStatus);
    } catch (e) {
      debugPrint("Error loading home: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtimeStatusListener() {
    final supabase = _api.getSupabase();
    _realtimeChannel = supabase
        .channel('public:profiles:home_status')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'profiles',
          callback: (payload) {
            final data = payload.newRecord;
            final oldData = payload.oldRecord;
            
            if (data == null) return;
            
            // Logic: Instant Hide if Offline/Unapproved/Not Face Verified
            final bool isVisible = data['is_host'] == true && 
                                  data['gender'] == 'female' && 
                                  data['is_online'] == true &&
                                  data['host_status'] == 'approved' &&
                                  data['is_face_verified'] == true;

            if (mounted) {
              setState(() {
                final index = _displayHosts.indexWhere((h) => h['id'] == data['id']);
                
                if (isVisible) {
                  if (index != -1) {
                    // Update existing
                    _displayHosts[index] = { ..._displayHosts[index], ...data };
                  } else {
                    // check if it should be added (if it matches current country/tab)
                    bool matchTab = true;
                    if (_activeTab == 'follow') matchTab = false; // Need follow logic
                    
                    bool matchCountry = _selectedCountry == 'all' || _selectedCountry == data['country_code'];
                    
                    if (matchTab && matchCountry) {
                      _displayHosts.insert(0, data);
                    }
                  }
                } else {
                  // Hide instantly if not visible anymore
                  if (index != -1) {
                    _displayHosts.removeAt(index);
                  }
                }
              });
            }
          },
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                _buildHeader(),
                _buildCountryScroller(),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadHosts,
                    color: const Color(0xFFEC4899),
                    backgroundColor: const Color(0xFF1A1035),
                    child: _isLoading
                        ? const Center(child: CircularProgressIndicator(color: Color(0xFFEC4899)))
                        : _buildHostGrid(),
                  ),
                ),
              ],
            ),
          ),
          // Web Parity: Event Banner Popup overlay managed autonomously
          const EventPopupBanner(),
          
        ],
      ),
    );
  }

  Widget _buildHeader() {
    final branding = Provider.of<AdminControllerService>(context).branding;
    final String? logoUrl = branding['logo_url'];
    final bool hasLogo = logoUrl != null && logoUrl.isNotEmpty;

    return ClipRRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05))),
          ),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            children: [
              // 1. Branding Row
              if (hasLogo)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Image.network(logoUrl, height: 28, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                ),
              
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Search Button (Left)
                  _buildCircularAction(LucideIcons.search, () {
                     HapticFeedback.lightImpact();
                     Navigator.pushNamed(context, '/search');
                  }),

                  // Sub Tabs (Center)
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(color: Colors.white.withOpacity(0.05)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildTabBtn('popular', 'Popular'),
                        _buildTabBtn('live', 'Live', hasRedDot: true),
                        _buildTabBtn('new', 'New'),
                        _buildTabBtn('follow', 'Follow'),
                      ],
                    ),
                  ),

                  // Leaderboard Button (Right)
                  _buildCircularAction(
                    LucideIcons.trophy, 
                    () {
                       HapticFeedback.lightImpact();
                       Navigator.pushNamed(context, '/leaderboard');
                    }, 
                    color: const Color(0xFFFBBF24),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCircularAction(IconData icon, VoidCallback onTap, {Color color = Colors.white70}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
    );
  }

  Widget _buildTabBtn(String id, String label, {bool hasRedDot = false}) {
    bool isActive = _activeTab == id;
    
    // Web Parity Gradients
    final List<Color> activeColors = id == 'live' 
        ? [const Color(0xFFEF4444), const Color(0xFFEC4899)]
        : [const Color(0xFFEC4899), const Color(0xFFA855F7)];

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _activeTab = id);
        _loadHosts();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          gradient: isActive ? LinearGradient(colors: activeColors) : null,
          borderRadius: BorderRadius.circular(30),
          boxShadow: isActive 
              ? [BoxShadow(color: activeColors[0].withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 2))]
              : [],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasRedDot) ...[
              Container(
                width: 6, height: 6,
                decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: GoogleFonts.inter(
                color: isActive ? Colors.white : Colors.white.withOpacity(0.4),
                fontSize: 12,
                fontWeight: isActive ? FontWeight.w900 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCountryScroller() {
    return Container(
      height: 48,
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: _countries.length,
        itemBuilder: (context, index) {
          final isSelected = _selectedCountry == _countries[index]['code'];
          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _selectedCountry = _countries[index]['code']!);
              _loadHosts();
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: isSelected 
                    ? const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFFA855F7)])
                    : null,
                color: isSelected ? null : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: isSelected ? Colors.transparent : Colors.white.withOpacity(0.05)),
                boxShadow: isSelected ? [const BoxShadow(color: Color(0x33A855F7), blurRadius: 4)] : [],
              ),
              child: Row(
                children: [
                  Text(_countries[index]['flag']!, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Text(
                    _countries[index]['name']!, 
                    style: GoogleFonts.inter(
                      color: isSelected ? Colors.white : Colors.white.withOpacity(0.6),
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleBannerClick(Map<String, dynamic> banner) async {
    final String? link = banner['link_url'];
    final String? linkType = banner['link_type'] ?? 'internal';
    final String title = banner['title'] ?? 'Promotion';

    if (link == null || link.isEmpty) return;

    if (linkType == 'internal' || link.startsWith('/')) {
      // Handle Internal Routes (Web Parity)
      if (link.contains('recharge') || link.contains('wallet')) {
        Navigator.pushNamed(context, '/recharge');
      } else if (link.contains('tasks') || link.contains('task')) {
        Navigator.pushNamed(context, '/tasks');
      } else if (link.contains('agency') || link.contains('policy')) {
        Navigator.pushNamed(context, '/agency_policy');
      } else if (link.contains('vip')) {
        Navigator.pushNamed(context, '/vip_shop');
      } else {
        // Generic fallback for other internal routes
        try {
          Navigator.pushNamed(context, link);
        } catch (e) {
          debugPrint("Route not found: $link");
        }
      }
    } else {
      // Handle External/Popup (Open in In-App Browser)
      try {
        final uri = Uri.parse(link);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      } catch (e) {
        debugPrint("Error launching URL: $e");
      }
    }
  }

  Widget _buildBannerView(List<Map<String, dynamic>> banners) {
    if (banners.isEmpty) return const SizedBox.shrink();
    return Column(
      children: banners.map((b) {
        final String? imgUrl = b['image_url'];
        final String title = b['title'] ?? '';
        return GestureDetector(
          onTap: () => _handleBannerClick(b),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 4)),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: imgUrl != null 
                ? Image.network(
                    imgUrl, 
                    fit: BoxFit.cover, 
                    width: double.infinity,
                    errorBuilder: (_, __, ___) => Container(height: 100, color: Colors.white.withOpacity(0.05), child: Center(child: Text(title, style: const TextStyle(color: Colors.white38)))),
                  ) 
                : Container(height: 100, color: Colors.purple.withOpacity(0.2), child: Center(child: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)))),
            ),
          ),
        ).animate().fadeIn().scale();
      }).toList(),
    );
  }

  Widget _buildHostGrid() {
    if (_displayHosts.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.users, color: Colors.white24, size: 64),
            const SizedBox(height: 16),
            Text(
              _activeTab == 'live' ? "No Live Streams" : "No Hosts Available",
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text("Pull down to refresh", style: GoogleFonts.outfit(color: Colors.white60, fontSize: 12)),
          ],
        ),
      );
    }

    // Split hosts list for 6 cards layout constraint
    final slice1 = _displayHosts.take(6).toList();
    final slice2 = _displayHosts.skip(6).toList();

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: Column(
        children: [
          // Top Banner (Level 1)
          _buildBannerView(_topBanners),
          
          // First 6 hosts grid
          if (slice1.isNotEmpty)
            GridView.builder(
              padding: const EdgeInsets.all(12),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2, 
                mainAxisSpacing: 12, 
                crossAxisSpacing: 12, 
                childAspectRatio: 0.75, // Web Parity 3/4
              ),
              itemCount: slice1.length,
              itemBuilder: (ctx, i) => FadeInUp(
                duration: const Duration(milliseconds: 400), 
                child: PremiumLiveCard(
                  user: slice1[i],
                  onTap: () => _handleCardTap(slice1[i]),
                ),
              ),
            ),

          // Level 2 Banner (Interleaved after 6 cards)
          _buildBannerView(_middleBanners),

          // Remaining hosts grid
          if (slice2.isNotEmpty)
            GridView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                 crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.75,
              ),
              itemCount: slice2.length,
              itemBuilder: (ctx, i) => FadeInUp(
                delay: const Duration(milliseconds: 100), 
                duration: const Duration(milliseconds: 400), 
                child: PremiumLiveCard(
                  user: slice2[i],
                  onTap: () => _handleCardTap(slice2[i]),
                ),
              ),
            ),
          const SizedBox(height: 100), // Space for floating buttons
        ],
      ),
    );
  }

  void _handleCardTap(Map<String, dynamic> user) {
    if (user['isLive'] == true && user['liveStreamId'] != null) {
      Navigator.pushNamed(context, '/live_room', arguments: {
        'id': user['liveStreamId'],
        'host_id': user['id'],
        'title': user['display_name'],
      });
    } else if (user['inParty'] == true && user['partyRoom'] != null) {
      Navigator.pushNamed(context, '/party_room', arguments: user['partyRoom']);
    } else {
      Navigator.pushNamed(context, '/profile_detail', arguments: user['id']);
    }
  }

}



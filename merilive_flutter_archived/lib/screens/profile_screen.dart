import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../utils/design_system.dart';
import '../widgets/three_d_icons.dart';
import '../widgets/avatar_with_frame.dart';
import '../widgets/level_progress_card.dart';
import '../utils/level_utils.dart';
import '../widgets/vip_badge.dart';
import '../services/localization_service.dart';

class ProfileScreen extends StatefulWidget {
  final String? userId;
  const ProfileScreen({super.key, this.userId});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic>? _profile;
  
  // Stats
  int _followersCount = 0;
  int _followingCount = 0;
  int _friendsCount = 0;
  
  // Balances
  int _diamonds = 0;
  int _beans = 0;
  double _traderWallet = 0;
  int _agencyDiamonds = 0;
  
  // Levels
  int _userLevel = 1;
  double _levelProgress = 0.0;
  int _currentXP = 0;
  int _nextLevelXP = 0;
  int _nextLevelNumber = 2;
  String? _levelIconUrl;
  
  // Status Flags
  bool _isAdmin = false;
  bool _isFaceVerified = false;
  bool _faceVerificationPending = false;
  bool _isAgencyOwner = false;
  bool _isHost = false;
  bool _isInAgency = false;
  bool _isCoinTrader = false;
  String _gender = 'male';
  Map<String, dynamic>? _subscription;
  
  // Getters
  bool get _isFemale => _gender.toLowerCase() == 'female';
  bool get _isOwnProfile => widget.userId == null || widget.userId == _api.currentUserId;

  @override
  void initState() {
    super.initState();
    _loadProfileData();
  }

  Future<void> _loadProfileData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final String inputId = widget.userId ?? _api.currentUserId!;
      final supa = _api.getSupabase();

      // 1. Resolve Profile (Handle App UID or UUID)
      Map<String, dynamic>? profile;
      bool isNumeric = RegExp(r'^[0-9]+$').hasMatch(inputId);
      
      if (isNumeric) {
        profile = await supa.from('profiles').select().eq('app_uid', inputId).maybeSingle();
      }
      
      if (profile == null) {
        profile = await supa.from('profiles').select().eq('id', inputId).maybeSingle();
      }

      if (profile == null) {
        if (mounted) setState(() => _isLoading = false);
        return;
      }

      final String resolvedId = profile['id'];

      // 2. Parallel Data Fetch
      final results = await Future.wait<dynamic>([
        supa.from('followers').select('id', const CountOption.exact()).eq('following_id', resolvedId),
        supa.from('followers').select('id', const CountOption.exact()).eq('follower_id', resolvedId),
        _api.checkAdminStatus(),
        supa.from('face_verification_submissions').select('id').eq('user_id', resolvedId).eq('status', 'pending').maybeSingle(),
        supa.from('agency_hosts').select('id').eq('host_id', resolvedId).eq('status', 'active').maybeSingle(),
        _api.getUserVIPSubscription(),
        _api.getCombinedTraderWallet(),
        supa.from('topup_helpers').select('id').eq('user_id', resolvedId).eq('is_active', true).maybeSingle(),
      ]);

      if (mounted) {
        _profile = profile;
        _followersCount = (results[0] as PostgrestResponse).count ?? 0;
        _followingCount = (results[1] as PostgrestResponse).count ?? 0;
        
        // Use standard field names from profiles table
        _diamonds = _profile?['coins'] ?? _profile?['diamond_balance'] ?? 0;
        _beans = _profile?['beans'] ?? _profile?['beans_balance'] ?? 0;
        
        _gender = (_profile?['gender'] ?? 'male').toString();
        _isHost = _profile?['is_host'] ?? false;
        _isAgencyOwner = _profile?['is_agency_owner'] ?? false;
        _isFaceVerified = _profile?['is_face_verified'] ?? false;
        
        // Helper/Trader Logic
        final walletData = results[6] as Map<String, dynamic>;
        _traderWallet = walletData['helper']?.toDouble() ?? 0.0;
        _agencyDiamonds = walletData['agency'] ?? 0;
        _isCoinTrader = (results[7] != null);
        
        final adminStatus = results[2] as Map<String, dynamic>?;
        _isAdmin = adminStatus?['isAdmin'] ?? false;

        _faceVerificationPending = (results[3] != null);
        _isInAgency = (results[4] != null);
        _subscription = results[5] as Map<String, dynamic>?;

        // 3. Level Progression logic
        await _calculateLevelProgress();
        
        _isLoading = false;
        setState(() {});
      }
    } catch (e) {
      debugPrint("Error loading profile data: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _calculateLevelProgress() async {
    if (_profile == null) return;
    try {
      final tiersRes = await _api.getSupabase()
          .from('user_level_tiers')
          .select('level_number, min_topup_amount, min_earning_amount')
          .eq('tier_type', _isHost && _isFemale ? 'host' : 'user')
          .eq('is_active', true)
          .order('level_number');
      
      final List<Map<String, dynamic>> tiers = List<Map<String, dynamic>>.from(tiersRes);
      if (tiers.isEmpty) return;

      final result = await LevelUtils.resolveLevelProgress(_profile!, tiers);

      _userLevel = result['level'];
      _levelProgress = result['progress'];
      _currentXP = result['currentXP'];
      _nextLevelXP = result['nextLevelXP'];
      _nextLevelNumber = result['nextLevelNumber'];
      _levelIconUrl = result['iconUrl'];
    } catch (e) {
      debugPrint("Error calculating level progress: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0C0515),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFEC4899))),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0C0515),
      body: Stack(
        children: [
          // 1. Premium 'Nebula' Background
          _buildPremiumBackground(),

          // 2. Main Scroll Content
          RefreshIndicator(
            onRefresh: _loadProfileData,
            color: const Color(0xFFEC4899),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                _buildSliverHeader(),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        const SizedBox(height: 12),
                        _buildIdentitySection(),
                        const SizedBox(height: 24),
                        _buildStatsGrid(),
                        const SizedBox(height: 24),
                        _buildWalletSection(),
                        const SizedBox(height: 32),
                        _buildMenuSection(),
                        const SizedBox(height: 120),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPremiumBackground() {
    return Positioned.fill(
      child: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF1A0533), Color(0xFF0F0720), Color(0xFF080312)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
          // Dynamic gradient blobs
          Positioned(
            top: -50, left: -50,
            child: Container(
              width: 300, height: 300,
              decoration: BoxDecoration(color: const Color(0xFF7E22CE).withOpacity(0.12), shape: BoxShape.circle),
              child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80), child: Container()),
            ),
          ),
          Positioned(
            bottom: 100, right: -50,
            child: Container(
              width: 250, height: 250,
              decoration: BoxDecoration(color: const Color(0xFFEC4899).withOpacity(0.08), shape: BoxShape.circle),
              child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 90, sigmaY: 90), child: Container()),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverHeader() {
    return SliverAppBar(
      expandedHeight: 300,
      pinned: true,
      stretch: true,
      backgroundColor: const Color(0xFF0C0515),
      elevation: 0,
      leading: _isOwnProfile ? null : IconButton(
        icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      actions: [
        if (_isOwnProfile)
          IconButton(
            icon: const Icon(LucideIcons.settings, color: Colors.white70),
            onPressed: () => Navigator.pushNamed(context, '/settings'),
          ),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            // Header Content
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 40),
                  AvatarWithFrame(
                    userId: _profile?['id'] ?? '',
                    src: _profile?['avatar_url'],
                    name: _profile?['display_name'] ?? 'User',
                    size: 110,
                    level: _userLevel,
                    isHost: _isHost,
                    isVerified: _isFaceVerified,
                    frameId: _profile?['equipped_frame_id'],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _profile?['display_name'] ?? 'User',
                        style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                      ),
                      if (_subscription != null) ...[
                        const SizedBox(width: 8),
                        VIPBadge(tier: (_subscription!['vip_tiers']?['tier_level'] as num?)?.toInt() ?? 0, size: 'sm'),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  _buildIdentityBadges(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildIdentityBadges() {
    Color themeColor = _isHost ? const Color(0xFFEC4899) : const Color(0xFF3B82F6);
    if (_isAgencyOwner) themeColor = const Color(0xFF8B5CF6);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: themeColor.withOpacity(0.15), 
            borderRadius: BorderRadius.circular(20), 
            border: Border.all(color: themeColor.withOpacity(0.3))
          ),
          child: Text(
            _isAgencyOwner ? "AGENCY OWNER" : (_isHost ? "OFFICIAL HOST" : "USER"),
            style: GoogleFonts.outfit(color: themeColor, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8)
          ),
        ),
        if (_isHost) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.15), 
              borderRadius: BorderRadius.circular(20), 
              border: Border.all(color: Colors.amber.withOpacity(0.3))
            ),
            child: Text(
              "HOST LV ${_profile?['host_level'] ?? 1}", 
              style: GoogleFonts.outfit(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8)
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildIdentitySection() {
    return Column(
      children: [
        GestureDetector(
          onTap: () {
            Clipboard.setData(ClipboardData(text: _profile?['app_uid']?.toString() ?? ""));
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("ID Copied!")));
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04), 
              borderRadius: BorderRadius.circular(30), 
              border: Border.all(color: Colors.white.withOpacity(0.06))
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.fingerprint, color: Colors.white24, size: 14),
                const SizedBox(width: 8),
                Text(
                  "ID: ${_profile?['app_uid'] ?? '---'}", 
                  style: GoogleFonts.spaceMono(color: Colors.white.withOpacity(0.6), fontSize: 13, fontWeight: FontWeight.bold)
                ),
                const SizedBox(width: 8),
                Icon(LucideIcons.copy, color: Colors.white.withOpacity(0.3), size: 14),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _buildIdentityTag(LucideIcons.globe, _profile?['country_name'] ?? "Bangladesh", const Color(0xFF10B981)),
            const SizedBox(width: 8),
            if (!(_profile?['hide_location'] ?? false)) ...[
              _buildIdentityTag(LucideIcons.mapPin, _profile?['district'] ?? "Location", Colors.white.withOpacity(0.5)),
              const SizedBox(width: 8),
            ],
            _buildIdentityTag(LucideIcons.languages, _profile?['language'] ?? "Bengali", const Color(0xFFF59E0B)),
          ],
        ),
      ],
    );
  }

  Widget _buildIdentityTag(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1), 
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 12),
          const SizedBox(width: 6),
          Text(
            label, 
            style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.bold)
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03), 
        borderRadius: BorderRadius.circular(24), 
        border: Border.all(color: Colors.white.withOpacity(0.04))
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _statItem(_friendsCount, "Friends"),
          _statDivider(),
          _statItem(_followingCount, "Following"),
          _statDivider(),
          _statItem(_followersCount, "Followers"),
        ],
      ),
    );
  }

  Widget _statDivider() => Container(width: 1, height: 24, color: Colors.white.withOpacity(0.08));

  Widget _statItem(int value, String label) {
    return Column(
      children: [
        Text(
          _api.formatNumber(value), 
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)
        ),
        Text(
          label, 
          style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.4), fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.5)
        ),
      ],
    );
  }

  Widget _buildWalletSection() {
    if (!_isOwnProfile) return const SizedBox();
    
    return Column(
      children: [
        Row(
          children: [
            // My Diamonds Card
            Expanded(
              child: _walletMiniCard(
                "My Diamonds", 
                NumberFormat('#,###').format(_diamonds), 
                const Color(0xFF9333EA), const Color(0xFF4F46E5), 
                const Diamond3DIcon(size: 32), 
                () => Navigator.pushNamed(context, '/recharge'), 
                "Top Up"
              ),
            ),
            const SizedBox(width: 12),
            // My Beans Card
            Expanded(
              child: _walletMiniCard(
                "My Beans", 
                NumberFormat('#,###').format(_beans), 
                const Color(0xFFF59E0B), const Color(0xFFEA580C), 
                const Beans3DIcon(size: 32), 
                _handleBeansClick, 
                _isAgencyOwner ? "Exchange" : (_isHost ? (_isFemale ? "Salary" : "Earnings") : "Exchange")
              ),
            ),
          ],
        ),
        
        // Trader/Agency Wallet (Dynamic)
        if (_isCoinTrader || _isAgencyOwner || _traderWallet > 0 || _agencyDiamonds > 0) ...[
          const SizedBox(height: 12),
          _buildTraderWalletCard(),
        ],
      ],
    );
  }

  void _handleBeansClick() {
    if (_isAgencyOwner) {
      Navigator.pushNamed(context, '/agency-exchange');
    } else if (_isHost) {
      if (_isInAgency) {
        Navigator.pushNamed(context, '/agency-withdrawal');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Join an agency to withdraw your salary"))
        );
        Navigator.pushNamed(context, '/join-agency');
      }
    } else {
      Navigator.pushNamed(context, '/exchange-beans');
    }
  }

  Widget _walletMiniCard(String title, String value, Color color1, Color color2, Widget icon, VoidCallback onTap, String badge) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 80,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [color1, color2], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: color1.withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))]
        ),
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      title, 
                      style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 10, fontWeight: FontWeight.w600)
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), 
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(8)), 
                      child: Text(badge, style: const TextStyle(color: Colors.white, fontSize: 7, fontWeight: FontWeight.bold))
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  value, 
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)
                ),
              ],
            ),
            Positioned(right: -5, bottom: -5, child: Opacity(opacity: 0.6, child: icon)),
          ],
        ),
      ),
    );
  }

  Widget _buildTraderWalletCard() {
    double totalBalance = _traderWallet + _agencyDiamonds;
    
    // Web Parity: Agency owners get Purple/Pink/Rose gradient, Traders get Green/Teal
    final List<Color> gradient = _isAgencyOwner 
        ? [const Color(0xFF9333EA), const Color(0xFFEC4899), const Color(0xFFFB7185)]
        : [const Color(0xFF10B981), const Color(0xFF059669)];

    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/wallet'),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: gradient[0].withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 8))]
        ),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      "Trader Wallet", 
                      style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.9), fontSize: 13, fontWeight: FontWeight.bold)
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                      child: Text(
                        _isAgencyOwner ? "Agency" : "Diamond Trader",
                        style: const TextStyle(color: Colors.white, fontSize: 7, fontWeight: FontWeight.bold)
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  NumberFormat('#,###').format(totalBalance), 
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(LucideIcons.send, color: Colors.white70, size: 10),
                    const SizedBox(width: 4),
                    Text(
                      "Tap to transfer to User or Agency", 
                      style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.7), fontSize: 10)
                    ),
                  ],
                ),
              ],
            ),
            const Spacer(),
            const Icon(LucideIcons.wallet, color: Colors.white, size: 36),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _menuLabel("DASHBOARDS"),
        
        // --- 1. Go Offline (Hosts Only) ---
        if (_isHost) 
          _menuItem("Go Offline", LucideIcons.power, Colors.redAccent, _handleGoOffline),
        
        // --- 2. Messages (Everyone) ---
        _menuItem("Messages", LucideIcons.messageCircle, const Color(0xFFEC4899), () => Navigator.pushNamed(context, '/chat')),
        
        // --- 3. Face Verification (If not verified) ---
        if (!_isFaceVerified) 
          _menuItem(
            "Face Verification", 
            LucideIcons.userCheck, 
            Colors.amber, 
            () => Navigator.pushNamed(context, '/face-verification'), 
            rightText: _faceVerificationPending ? "Reviewing" : "Required",
            highlight: !_faceVerificationPending
          ),
        
        // --- 4. My Level Section (Progress Card) ---
        const SizedBox(height: 12),
        LevelProgressCard(
          level: _userLevel, 
          progress: _levelProgress, 
          currentXP: _currentXP, 
          nextLevelXP: _nextLevelXP, 
          nextLevelNumber: _nextLevelNumber, 
          isHost: _isHost && _isFemale, 
          iconUrl: _levelIconUrl,
          onTap: () => Navigator.pushNamed(context, '/level'),
        ),
        const SizedBox(height: 12),

        // --- 5. Call Price Update (Female Hosts Only) ---
        if (_isHost && _isFemale)
          _menuItem("Call Price Update", LucideIcons.phoneCall, const Color(0xFF10B981), () => _showCallPricePlaceholder()),

        // --- 6. VIP Membership ---
        _menuItem(
          "VIP Membership", 
          LucideIcons.crown, 
          const Color(0xFF8B5CF6), 
          () => Navigator.pushNamed(context, '/vip'),
          rightText: _subscription != null ? "Active" : "Upgrade"
        ),

        // --- 7. Call History (Hosts Only) ---
        if (_isHost && _isFemale)
          _menuItem("Call History", LucideIcons.phone, const Color(0xFF3B82F6), () => Navigator.pushNamed(context, '/call-history')),

        // --- 8. Shop ---
        _menuItem("Shop", LucideIcons.shoppingBag, const Color(0xFFEC4899), () => Navigator.pushNamed(context, '/shop'), highlight: true),

        // --- 9. Withdraw Earnings (Hosts Only) ---
        if (_isHost)
          _menuItem("Withdraw Earnings", LucideIcons.wallet, const Color(0xFF10B981), () => Navigator.pushNamed(context, '/agency-withdrawal'), rightText: "Salary"),

        // --- 10. Agency Application / Details (Dynamic) ---
        if (_isHost) ...[
          if (_isInAgency)
            _menuItem("Agency Details", LucideIcons.building2, const Color(0xFF10B981), () => Navigator.pushNamed(context, '/agency-details'))
          else
            _menuItem("Agency Apply", LucideIcons.building2, Colors.pinkAccent, () => Navigator.pushNamed(context, '/join-agency'), highlight: true),
        ],

        // --- 11. Agency Dashboard (Agency Owners) ---
        if (_isAgencyOwner)
          _menuItem("Agency Dashboard", LucideIcons.layoutDashboard, const Color(0xFF8B5CF6), () => Navigator.pushNamed(context, '/agency-dashboard'), highlight: true),

        // --- 12. Offline Message ---
        _menuItem("Offline Message", LucideIcons.messageSquare, Colors.blueAccent, () => _showOfflineMessageDialog()),

        // --- 13. Invitation & Tasks ---
        _menuItem("My Invitation", LucideIcons.mail, const Color(0xFF6366F1), () => Navigator.pushNamed(context, '/invitation')),
        _menuItem("My Task", LucideIcons.clipboardList, const Color(0xFF3B82F6), () => Navigator.pushNamed(context, '/tasks')),

        // --- 14. Priority Support (Level 6+) ---
        if (_userLevel >= 6)
          _menuItem("Priority Support", LucideIcons.headset, Colors.amber, () => Navigator.pushNamed(context, '/customer-service'), rightText: "VIP"),

        // --- 15. Profile & Settings ---
        _menuItem("My Profile", LucideIcons.user, const Color(0xFF6366F1), () => Navigator.pushNamed(context, '/edit-profile')),
        _menuItem("Settings", LucideIcons.settings, Colors.white30, () => Navigator.pushNamed(context, '/settings')),
        
        const SizedBox(height: 24),
        _menuItem("Logout", LucideIcons.logOut, Colors.white24, _handleLogout),
      ],
    );
  }

  Widget _menuLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 16),
      child: Text(
        text, 
        style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.25), fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5)
      ),
    );
  }

  Widget _menuItem(String title, IconData icon, Color color, VoidCallback onTap, {String? rightText, bool highlight = false}) {
    return Container(
      margin: const EdgeInsets.bottom(12),
      decoration: BoxDecoration(
        color: highlight ? color.withOpacity(0.05) : Colors.white.withOpacity(0.03), 
        borderRadius: BorderRadius.circular(16), 
        border: Border.all(color: highlight ? color.withOpacity(0.2) : Colors.white.withOpacity(0.04))
      ),
      child: ListTile(
        onTap: onTap,
        dense: true,
        leading: Container(
          padding: const EdgeInsets.all(8), 
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)), 
          child: Icon(icon, color: color, size: 20)
        ),
        title: Text(
          title, 
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500)
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (rightText != null) 
              Text(rightText, style: GoogleFonts.outfit(color: color.withOpacity(0.6), fontSize: 11, fontWeight: FontWeight.bold)),
            const SizedBox(width: 8),
            Icon(LucideIcons.chevronRight, color: Colors.white.withOpacity(0.1), size: 18),
          ],
        ),
      ),
    );
  }

  void _handleGoOffline() async {
    final confirmed = await _showConfirmDialog("Go Offline?", "You will stop receiving calls and messages. You will be logged out.");
    if (confirmed) {
      await _api.logout();
      if (mounted) Navigator.pushReplacementNamed(context, '/auth');
    }
  }

  void _handleLogout() async {
    final confirmed = await _showConfirmDialog("Logout?", "Are you sure you want to exit?");
    if (confirmed) {
      await _api.logout();
      if (mounted) Navigator.pushReplacementNamed(context, '/auth');
    }
  }

  Future<bool> _showConfirmDialog(String title, String content) async {
    return await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(title, style: const TextStyle(color: Colors.white)),
        content: Text(content, style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Yes", style: TextStyle(color: Colors.redAccent))),
        ],
      )
    ) ?? false;
  }

  void _showOfflineMessageDialog() {
    final controller = TextEditingController(text: _profile?['offline_message'] ?? "");
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text("Set Offline Message", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: "I'll be back soon...", 
            hintStyle: const TextStyle(color: Colors.white24),
            filled: true,
            fillColor: Colors.black26,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none)
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEC4899), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
            onPressed: () async {
              await _api.updateOfflineMessage(controller.text);
              if (mounted) {
                Navigator.pop(ctx);
                _loadProfileData();
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Offline message updated!")));
              }
            }, 
            child: const Text("Save", style: TextStyle(color: Colors.white))
          ),
        ],
      )
    );
  }

  void _showCallPricePlaceholder() {
     ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Call Price Update feature is coming soon!")));
  }
}

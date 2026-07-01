import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:math' as math;
import '../services/api_service.dart';
import '../widgets/three_d_icons.dart';

class RechargeScreen extends StatefulWidget {
  const RechargeScreen({super.key});

  @override
  State<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends State<RechargeScreen> with TickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  late AnimationController _particleController;
  
  bool _isLoading = true;
  int _diamondBalance = 0;
  String? _userCountryCode;
  String? _userAppUid;
  
  List<Map<String, dynamic>> _l5Traders = [];
  List<Map<String, dynamic>> _standardTraders = [];
  List<Map<String, dynamic>> _packages = [];
  Map<String, dynamic>? _rechargeBannerConfig;
  bool _isFirstRecharge = false;

  // Selection & Rotation State
  String _selectedTab = "google";
  String? _selectedPaymentType; // bkash, nagad, etc.
  Map<String, dynamic>? _selectedPackage;
  
  // Static state to persist rotation across screen visits in same session
  static final Map<String, List<String>> _usedMethodsByType = {};
  static String _nextLocalRoute = "auto";

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this, initialIndex: 0);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() {
          _selectedTab = ["google", "recommend", "helper"][_tabController.index];
        });
      }
    });

    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();

    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _particleController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile != null) {
        _diamondBalance = profile['coins'] ?? 0;
        _userCountryCode = profile['country_code'];
        _userAppUid = profile['app_uid'];
      }

      // 1. Fetch Packages & First Recharge Info
      final pkgResults = await Future.wait([
        _api.getDiamondPackages(),
        _api.supabase.from('first_recharge_claims').select('id').eq('user_id', _api.currentUserId).maybeSingle(),
        _api.supabase.from('first_recharge_bonus').select('*').eq('is_active', true).maybeSingle(),
      ]);

      _packages = List<Map<String, dynamic>>.from(pkgResults[0]);
      _isFirstRecharge = pkgResults[1] == null;
      _rechargeBannerConfig = pkgResults[2] as Map<String, dynamic>?;

      if (_userCountryCode != null) {
        // 2. Fetch Traders (L5 and Standard)
        final traders = await Future.wait([
          _api.getRecommendedTraders(_userCountryCode!),
          _api.getStandardTraders(_userCountryCode!),
        ]);
        _l5Traders = traders[0];
        _standardTraders = traders[1];

        // 3. Auto-select first payment type if available
        if (_l5Traders.isNotEmpty) {
          final types = _l5Traders.map((t) => t['method_name'].toString().toLowerCase()).toSet().toList();
          if (types.isNotEmpty) {
            _selectedPaymentType = types[0];
          }
        }
      }

      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Recharge Load Error: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // --- ROUND ROBIN LOGIC (100% Parity with pickNonRepeatingMethod) ---
  Map<String, dynamic>? _getCurrentHelper() {
    if (_l5Traders.isEmpty || _selectedPaymentType == null) return null;

    final type = _selectedPaymentType!.toLowerCase();
    final matched = _l5Traders.where((t) => t['method_name'].toString().toLowerCase() == type).toList();
    if (matched.isEmpty) return null;

    // Route logic: auto vs manual alternation
    final isAuto = (m) => ["sslcommerz", "aamarpay", "zinipay"].contains(m['additional_info']?['gateway_type']?.toString().toLowerCase());
    final autoPool = matched.where(isAuto).toList();
    final manualPool = matched.where((m) => !isAuto(m)).toList();

    List<Map<String, dynamic>> pool;
    String routeKey;

    if (autoPool.isNotEmpty && manualPool.isNotEmpty) {
      routeKey = "${type}:$_nextLocalRoute";
      pool = _nextLocalRoute == "auto" ? autoPool : manualPool;
    } else if (autoPool.isNotEmpty) {
      routeKey = "$type:auto";
      pool = autoPool;
    } else {
      routeKey = "$type:manual";
      pool = manualPool;
    }

    final usedIds = _usedMethodsByType[routeKey] ?? [];
    final unused = pool.where((m) => !usedIds.contains(m['id'])).toList();
    final finalPool = unused.isNotEmpty ? unused : pool;

    final chosen = finalPool[0]; // Take first available from shuffled/unused

    return chosen;
  }

  void _advanceRotation() {
    if (_selectedPaymentType == null) return;
    // Advance nextLocalRoute for next pick
    _nextLocalRoute = _nextLocalRoute == "auto" ? "manual" : "auto";
    
    // Add current pick to used list
    final helper = _getCurrentHelper();
    if (helper != null) {
      final type = _selectedPaymentType!.toLowerCase();
      final routeKey = "${type}:${isAutoGateway(helper) ? 'auto' : 'manual'}";
      _usedMethodsByType[routeKey] = [...(_usedMethodsByType[routeKey] ?? []), helper['id']];
    }
    setState(() {});
  }

  bool isAutoGateway(Map<String, dynamic> helper) {
    return ["sslcommerz", "aamarpay", "zinipay"].contains(helper['additional_info']?['gateway_type']?.toString().toLowerCase());
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFEC4899))),
      );
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF2D1045), Color(0xFF1A0A2E), Color(0xFF0D0618)],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _buildHeader(),
              _buildBalanceSection(),
              _buildTabs(),
              Expanded(
                child: Container(
                  decoration: const BoxDecoration(
                    color: Color(0xFFF8F4FF),
                    borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                  ),
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                      child: Column(
                        children: [
                          if (_isFirstRecharge) _buildBonusBanner(),
                          const SizedBox(height: 16),
                          _buildTabContent(),
                          const SizedBox(height: 24),
                          _buildSectionLabel("SELECT PACKAGE"),
                          const SizedBox(height: 12),
                          _buildPackageGrid(),
                          const SizedBox(height: 40),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          Text(
            "Diamond Store",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          IconButton(
            icon: const Icon(LucideIcons.fileText, color: Colors.white70),
            onPressed: () => Navigator.pushNamed(context, '/recharge-history'),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceSection() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(
        children: [
          const Diamond3DIcon(size: 40),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Your Balance", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12)),
              Text(
                NumberFormat('#,###').format(_diamondBalance),
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const Spacer(),
          if (_userCountryCode != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _userCountryCode!,
                style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
        ),
        labelColor: const Color(0xFF2D1045),
        unselectedLabelColor: Colors.white70,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        tabs: const [
          Tab(text: "Diamonds"),
          Tab(text: "Offers"),
          Tab(text: "Helpers"),
        ],
      ),
    );
  }

  Widget _buildBonusBanner() {
    return Container(
      height: 90,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [Color(0xFF1A0A2E), Color(0xFF2D1045)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(color: Colors.amber.withOpacity(0.1), blurRadius: 10, spreadRadius: 2),
        ],
      ),
      child: Stack(
        children: [
          // Shimmer/Particle background simulation
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _particleController,
              builder: (context, child) {
                return CustomPaint(
                  painter: BonusParticlePainter(_particleController.value),
                );
              },
            ),
          ),
          Row(
            children: [
              const SizedBox(width: 12),
              Image.network(
                "https://vscofghrctkqnscqntid.supabase.co/storage/v1/object/public/media/assets/treasure-chest-3d.png",
                width: 70,
                height: 70,
                errorBuilder: (_, __, ___) => const Icon(LucideIcons.gift, size: 50, color: Colors.amber),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _rechargeBannerConfig?['banner_title'] ?? "FIRST RECHARGE BONUS",
                      style: GoogleFonts.outfit(
                        color: Colors.amber,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1,
                      ),
                    ),
                    Text(
                      _rechargeBannerConfig?['banner_subtitle'] ?? "Get extra bonus diamonds now",
                      style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSectionLabel(String text) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        style: GoogleFonts.outfit(
          color: Colors.black45,
          fontSize: 12,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_selectedTab) {
      case "google": return _buildGoogleTab();
      case "recommend": return _buildRecommendTab();
      case "helper": return _buildHelperTab();
      default: return const SizedBox.shrink();
    }
  }

  Widget _buildGoogleTab() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)],
      ),
      child: Column(
        children: [
          _paymentMethodCard(
            "Google Play",
            "Instant • Worldwide",
            "🎮",
            const Color(0xFF10B981),
            true,
          ),
          const SizedBox(height: 12),
          Text(
            "Safe and instant recharge via Google Play Store. Supported worldwide.",
            textAlign: TextAlign.center,
            style: GoogleFonts.outfit(color: Colors.black54, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildRecommendTab() {
    final types = _l5Traders.map((t) => t['method_name'].toString().toLowerCase()).toSet().toList();
    final helper = _getCurrentHelper();

    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: types.map((type) {
              final isSelected = _selectedPaymentType == type;
              return GestureDetector(
                onTap: () => setState(() => _selectedPaymentType = type),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected ? const Color(0xFFEC4899) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 5)],
                  ),
                  child: Text(
                    type.toUpperCase(),
                    style: GoogleFonts.outfit(
                      color: isSelected ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),
        if (helper != null) _buildHelperQuickCard(helper),
      ],
    );
  }

  Widget _buildHelperQuickCard(Map<String, dynamic> helper) {
    final hData = helper['helper_data'];
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)],
      ),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundImage: hData['avatar_url'] != null ? NetworkImage(hData['avatar_url']) : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(hData['display_name'] ?? "Helper", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text("LEVEL 5 AUTHORIZED", style: GoogleFonts.outfit(color: Colors.teal, fontSize: 10, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const Icon(LucideIcons.shieldCheck, color: Colors.teal),
            ],
          ),
          const Divider(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Account Number", style: GoogleFonts.outfit(color: Colors.black45, fontSize: 12)),
                  Text(helper['account_number'] ?? "N/A", style: GoogleFonts.spaceMono(fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
              IconButton(
                icon: const Icon(LucideIcons.copy, color: Color(0xFFEC4899)),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: helper['account_number'] ?? ""));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Copied!")));
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _advanceRotation,
            child: Text("Show different number", style: GoogleFonts.outfit(color: Colors.blue, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildHelperTab() {
    if (_standardTraders.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(40),
        child: Column(
          children: [
            const Icon(LucideIcons.users, size: 48, color: Colors.black12),
            const SizedBox(height: 12),
            Text("No helpers active in your region", style: GoogleFonts.outfit(color: Colors.black38)),
          ],
        ),
      );
    }

    return Column(
      children: _standardTraders.map((t) => _buildStandardHelperCard(t)).toList(),
    );
  }

  Widget _buildStandardHelperCard(Map<String, dynamic> trader) {
    final user = trader['user'];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 5)],
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundImage: user['avatar_url'] != null ? NetworkImage(user['avatar_url']) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user['display_name'] ?? "Trader", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
                Text("LV.${trader['trader_level']} VERIFIED", style: GoogleFonts.outfit(color: Colors.orange, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(LucideIcons.messageCircle, color: Color(0xFFEC4899)),
            onPressed: () => Navigator.pushNamed(context, '/chat', arguments: {
              'id': user['id'],
              'display_name': user['display_name'],
              'autoMessage': "Hi, I want to buy diamonds. My UID: $_userAppUid"
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildPackageGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _packages.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.8,
      ),
      itemBuilder: (context, index) => _buildPackageCard(_packages[index]),
    );
  }

  Widget _buildPackageCard(Map<String, dynamic> pkg) {
    final total = (pkg['coins_amount'] ?? 0) + (pkg['bonus_coins'] ?? 0);
    return GestureDetector(
      onTap: () => _handlePackageSelect(pkg),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.black.withOpacity(0.05)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10)],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Diamond3DIcon(size: 40),
            const SizedBox(height: 8),
            Text(NumberFormat('#,###').format(total), style: GoogleFonts.outfit(fontSize: 22, fontWeight: FontWeight.bold)),
            if (pkg['bonus_coins'] > 0)
              Text("+${pkg['bonus_coins']} Bonus", style: GoogleFonts.outfit(color: Colors.teal, fontSize: 10, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFEC4899).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                "৳${pkg['price_bdt'] ?? (pkg['price_usd'] * 120).toInt()}",
                style: GoogleFonts.outfit(color: const Color(0xFFEC4899), fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _paymentMethodCard(String title, String sub, String emoji, Color color, bool selected) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: selected ? color : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: selected ? color : Colors.black12),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
            child: Text(emoji, style: const TextStyle(fontSize: 20)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.outfit(color: selected ? Colors.white : Colors.black87, fontWeight: FontWeight.bold)),
                Text(sub, style: GoogleFonts.outfit(color: selected ? Colors.white70 : Colors.black45, fontSize: 10)),
              ],
            ),
          ),
          if (selected) const Icon(LucideIcons.checkCircle, color: Colors.white, size: 20),
        ],
      ),
    );
  }

  void _handlePackageSelect(Map<String, dynamic> pkg) {
    if (_selectedTab == "google") {
      _showNotImplemented("Google Play Billing");
      return;
    }
    
    final helper = _getCurrentHelper();
    if (helper == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("No helper available for this method.")));
      return;
    }

    _showSubmitProofModal(pkg, helper);
  }

  void _showSubmitProofModal(Map<String, dynamic> pkg, Map<String, dynamic> helper) {
    final trxController = TextEditingController();
    File? proofFile;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            padding: EdgeInsets.only(
              left: 24, right: 24, top: 32,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 32,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Diamond3DIcon(size: 48),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text("Recharge Diamonds", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 18)),
                        Text("Pay to: ${helper['account_number']}", style: GoogleFonts.outfit(color: const Color(0xFFEC4899), fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: trxController,
                  decoration: InputDecoration(
                    labelText: "Transaction ID",
                    prefixIcon: const Icon(LucideIcons.hash),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
                const SizedBox(height: 16),
                GestureDetector(
                  onTap: () async {
                    final picker = ImagePicker();
                    final img = await picker.pickImage(source: ImageSource.gallery);
                    if (img != null) setModalState(() => proofFile = File(img.path));
                  },
                  child: Container(
                    height: 100, width: double.infinity,
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.black12),
                    ),
                    child: proofFile != null 
                      ? Image.file(proofFile!, fit: BoxFit.cover)
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.upload, color: Colors.black26),
                            Text("Upload Payment Proof", style: GoogleFonts.outfit(color: Colors.black26, fontSize: 12)),
                          ],
                        ),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: () => _submitOrder(pkg, helper, trxController.text, proofFile),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEC4899),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: Text("SUBMIT ORDER", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          );
        }
      ),
    );
  }

  Future<void> _submitOrder(Map<String, dynamic> pkg, Map<String, dynamic> helper, String trx, File? proof) async {
    if (trx.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transaction ID is required")));
      return;
    }

    Navigator.pop(context); // Close modal
    setState(() => _isLoading = true);

    try {
      String? proofUrl;
      if (proof != null) {
        proofUrl = await _api.uploadPaymentProof(proof);
      }

      await _api.submitRechargeRequest(
        helperId: helper['helper_id'],
        packageId: pkg['id'],
        transactionId: trx,
        paymentProofUrl: proofUrl,
      );

      _advanceRotation(); // Advance the rotation on success
      
      if (mounted) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text("Order Submitted"),
            content: const Text("The helper will process your request shortly. You will be notified once complete."),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("OK"))],
          ),
        );
      }
    } catch (e) {
      debugPrint("Order Submit Error: $e");
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to submit order. Please try again.")));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showNotImplemented(String feature) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(feature),
        content: const Text("This feature is currently being integrated for your region. Please use Offers/Helpers for now."),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("OK"))],
      ),
    );
  }
}

class BonusParticlePainter extends CustomPainter {
  final double progress;
  final math.Random random = math.Random(42); // Seeded for consistency

  BonusParticlePainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    for (int i = 0; i < 15; i++) {
      final double seedX = math.sin(i * 1.5) * 0.5 + 0.5;
      final double seedY = math.cos(i * 2.2) * 0.5 + 0.5;
      final double speed = 0.5 + (i % 5) * 0.1;
      
      final double x = (seedX * size.width + (progress * speed * 50)) % size.width;
      final double y = (seedY * size.height + (math.sin(progress * 4 + seedX * 10) * 15)) % size.height;
      
      final double opacity = 0.1 + (math.sin(progress * 5 + i) + 1) * 0.2;
      final double radius = 1.5 + (i % 3);

      final paint = Paint()
        ..color = Colors.amber.withOpacity(opacity.clamp(0.0, 0.5))
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
      
      canvas.drawCircle(Offset(x, y), radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant BonusParticlePainter oldDelegate) => true;
}
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: Image.file(selectedImage!, fit: BoxFit.cover),
                          )
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(LucideIcons.camera, color: Colors.white24),
                              const SizedBox(height: 8),
                              Text("UPLOAD SCREENSHOT (OPTIONAL)", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: isUploading ? null : () async {
                      if (trxController.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please enter transaction ID")));
                        return;
                      }
                      
                      setModalState(() => isUploading = true);
                      
                      String? proofUrl;
                      if (selectedImage != null) {
                        proofUrl = await _api.uploadPaymentProof(selectedImage!);
                      }
                      
                      final success = await _api.submitRechargeRequest(
                        packageId: pkg['id'],
                        amount: pkg['price_bdt'] ?? (pkg['price_usd'] * 120).toInt(),
                        gateway: _selectedMethod,
                        transactionId: trxController.text.trim(),
                        senderNumber: phoneController.text.trim(),
                        proofUrl: proofUrl,
                        helperId: _currentHelper?['helper']?['id'],
                      );
                      
                      if (mounted) {
                        Navigator.pop(ctx);
                        if (success) {
                          _showSuccessDialog();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to submit request. Please try again.")));
                        }
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEC4899),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 8,
                      shadowColor: const Color(0xFFEC4899).withOpacity(0.4),
                    ),
                    child: isUploading 
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text("SUBMIT PAYMENT PROOF", style: TextStyle(fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 1)),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 20),
            const Icon(LucideIcons.checkCircle2, color: Color(0xFF2DD4BF), size: 64),
            const SizedBox(height: 24),
            Text("ORDER SUBMITTED", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            const Text(
              "Your payment is being verified by our team. Diamonds will be credited to your account shortly.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white38, fontSize: 13),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEC4899), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: const Text("AWESOME", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _modalTextField(String hint, IconData icon, TextEditingController controller) {
    return TextField(
      controller: controller,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white24, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1),
        prefixIcon: Icon(icon, color: Colors.white38, size: 18),
        filled: true,
        fillColor: Colors.white.withOpacity(0.05),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFEC4899), width: 1)),
      ),
    );
  }
}

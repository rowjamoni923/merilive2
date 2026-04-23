import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class UnifiedWalletScreen extends StatefulWidget {
  const UnifiedWalletScreen({super.key});

  @override
  State<UnifiedWalletScreen> createState() => _UnifiedWalletScreenState();
}

class _UnifiedWalletScreenState extends State<UnifiedWalletScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic>? _userProfile;
  Map<String, dynamic> _settings = {};
  
  // Wallet Data
  int _diamonds = 0;
  int _beans = 0;
  int _traderWallet = 0;
  
  // Role Flags
  bool _isHost = false;
  bool _isAgencyOwner = false;
  bool _isTrader = false;
  
  @override
  void initState() {
    super.initState();
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final settings = await _api.getFinanceSettings();
      
      if (profile != null) {
        // Detect Roles
        final bool isHost = profile['is_host'] == true || profile['is_host'] == 'true';
        final bool isAgency = profile['is_agency_owner'] == true;
        
        // Fetch Helper/Trader wallet (Check by topup_helpers table)
        int traderBalance = 0;
        final helperRes = await _api.getSupabase()
            .from('topup_helpers')
            .select('id, wallet_balance')
            .eq('user_id', profile['id'])
            .maybeSingle();
            
        final bool isTrader = helperRes != null;
        if (isTrader) {
          final stats = await _api.getTraderWalletStats(helperRes['id']);
          traderBalance = stats['total_balance'] ?? 0;
        }

        setState(() {
          _userProfile = profile;
          _settings = settings;
          _isHost = isHost;
          _isAgencyOwner = isAgency;
          _isTrader = isTrader;
          _diamonds = profile['diamond_balance'] ?? profile['coins'] ?? 0;
          _beans = profile['beans_balance'] ?? profile['beans'] ?? 0;
          _traderWallet = traderBalance;
        });
      }
    } catch (e) {
      debugPrint("Wallet load error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF6366F1))),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                _buildSliverAppBar(),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildRoleBadge(),
                        const SizedBox(height: 20),
                        _buildTopupCard(),
                        const SizedBox(height: 24),
                        _buildBeansCard(),
                        if (_isTrader || _isAgencyOwner) ...[
                          const SizedBox(height: 24),
                          _buildTraderWalletCard(),
                        ],
                        const SizedBox(height: 32),
                        _buildHistorySection(),
                        const SizedBox(height: 100),
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

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      pinned: true,
      centerTitle: true,
      leading: IconButton(
        icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text(
        "MY WALLET",
        style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
      ),
      actions: [
        IconButton(
          icon: const Icon(LucideIcons.helpCircle, color: Colors.white70, size: 20),
          onPressed: () => _showWalletInfo(),
        ),
      ],
    );
  }

  Widget _buildRoleBadge() {
    String label = "STANDARD USER";
    IconData icon = LucideIcons.user;
    Color color = Colors.blueAccent;

    if (_isTrader) {
      label = "OFFICIAL TRADER";
      icon = LucideIcons.shieldCheck;
      color = Colors.greenAccent;
    } else if (_isAgencyOwner) {
      label = "AGENCY OWNER";
      icon = LucideIcons.building2;
      color = Colors.amber;
    } else if (_isHost) {
      label = "VERIFIED HOST";
      icon = LucideIcons.star;
      color = const Color(0xFFEC4899);
    }

    return FadeInLeft(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 14),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.outfit(color: color, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopupCard() {
    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
            begin: Alignment.topLeft, end: Alignment.bottomRight
          ),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [BoxShadow(color: Colors.blue.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("MY TOPUP", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                const Icon(LucideIcons.gem, color: Colors.white, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  NumberFormat('#,###').format(_diamonds),
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                const Text("Diamonds", style: TextStyle(color: Colors.white60, fontSize: 14)),
              ],
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/recharge'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withOpacity(0.2),
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text("RECHARGE NOW"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBeansCard() {
    return FadeInUp(
      delay: const Duration(milliseconds: 100),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
            begin: Alignment.topLeft, end: Alignment.bottomRight
          ),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [BoxShadow(color: const Color(0xFFD97706).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_isHost ? "MY EARNINGS" : "MY BEANS", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                const Icon(LucideIcons.flame, color: Colors.white, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  NumberFormat('#,###').format(_beans),
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                const Text("Beans", style: TextStyle(color: Colors.white60, fontSize: 14)),
              ],
            ),
            const SizedBox(height: 24),
            
            if (_isHost) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    const Icon(LucideIcons.info, color: Colors.white70, size: 18),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        "Automatic weekly transfer to Agency. No manual exchange allowed.",
                        style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (_isAgencyOwner || _isTrader) ...[
              _buildExchangeButton(
                label: "EXCHANGE TO TRADER WALLET",
                color: Colors.white.withOpacity(0.2),
                onPressed: () => _showExchangeDialog(target: 'trader'),
              ),
            ] else ...[
              _buildExchangeButton(
                label: "EXCHANGE TO DIAMONDS",
                color: Colors.white.withOpacity(0.2),
                onPressed: () => _showExchangeDialog(target: 'diamonds'),
              ),
              const SizedBox(height: 12),
              Text(
                "* Fee: ${_settings['exchange_fee_percent'] ?? 25}% | Min: ${_settings['min_exchange_amount'] ?? 100000} Beans",
                style: const TextStyle(color: Colors.white38, fontSize: 10),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTraderWalletCard() {
    return FadeInUp(
      delay: const Duration(milliseconds: 200),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFEC4899), Color(0xFFE11D48)],
            begin: Alignment.topLeft, end: Alignment.bottomRight
          ),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [BoxShadow(color: const Color(0xFFE11D48).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("TRADER WALLET", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                const Icon(LucideIcons.shieldCheck, color: Colors.white, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              NumberFormat('#,###').format(_traderWallet),
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/coin-trader-hub'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withOpacity(0.2),
                foregroundColor: Colors.white,
                elevation: 0,
                minimumSize: const Size(double.infinity, 50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text("MANAGE TRANSACTIONS"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExchangeButton({required String label, required Color color, required VoidCallback onPressed}) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
        child: Text(label, style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13)),
      ),
    );
  }

  Widget _buildHistorySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("RECENT TRANSACTIONS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Container(
          height: 300,
          child: Center(
            child: Column(
               mainAxisAlignment: MainAxisAlignment.center,
               children: [
                 const Icon(LucideIcons.list, color: Colors.white10, size: 40),
                 const SizedBox(height: 12),
                 Text("No recent transaction history", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 12)),
               ],
            ),
          ),
        ),
      ],
    );
  }

  void _showExchangeDialog({required String target}) {
    final TextEditingController controller = TextEditingController();
    final int minAmount = _settings['min_exchange_amount'] ?? 100000;
    
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text("EXCHANGE BEANS", style: GoogleFonts.outfit(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Available: ${NumberFormat('#,###').format(_beans)} Beans",
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: "Enter Bean Amount",
                hintStyle: const TextStyle(color: Colors.white24),
                filled: true,
                fillColor: Colors.black26,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "* Minimum $minAmount Beans required",
              style: const TextStyle(color: Colors.amber, fontSize: 10),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("CANCEL", style: TextStyle(color: Colors.white60))),
          ElevatedButton(
            onPressed: () async {
              final val = int.tryParse(controller.text) ?? 0;
              if (val < minAmount) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Amount below minimum")));
                return;
              }
              Navigator.pop(ctx);
              _handleExchange(val, target);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
            child: const Text("EXCHANGE"),
          ),
        ],
      ),
    );
  }

  Future<void> _handleExchange(int amount, String target) async {
    HapticFeedback.mediumImpact();
    setState(() => _isLoading = true);
    
    Map<String, dynamic> res;
    if (target == 'diamonds') {
      res = await _api.exchangeBeansToDiamonds(amount);
    } else {
      res = await _api.exchangeBeansToTrader(amount);
    }

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Exchange Successful!")));
      _loadAllData(); // Refresh
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: ${res['error']}")));
      setState(() => _isLoading = false);
    }
  }

  void _showWalletInfo() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Wallet Information", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            _infoRow(LucideIcons.gem, "Diamonds: Used for Gifting, VIP, and shop items."),
            const SizedBox(height: 16),
            _infoRow(LucideIcons.flame, "Beans: Earned from receiving gifts. Can be exchanged for Diamonds."),
            const SizedBox(height: 16),
            _infoRow(LucideIcons.lock, "Host Earnings: Automatically transferred to Agency weekly."),
            const SizedBox(height: 16),
            _infoRow(LucideIcons.shieldCheck, "Security: All transitions are secured via Admin SSL protocols."),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Colors.blueAccent, size: 20),
        const SizedBox(width: 16),
        Expanded(child: Text(text, style: const TextStyle(color: Colors.white70, fontSize: 13))),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/api_service.dart';
import '../widgets/vip_badge.dart';
import '../widgets/three_d_icons.dart';
import '../widgets/network_svga_player.dart';
import '../widgets/animation_handler.dart';

class VipScreen extends StatefulWidget {
  const VipScreen({super.key});

  @override
  State<VipScreen> createState() => _VipScreenState();
}

class _VipScreenState extends State<VipScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  int _diamonds = 0;
  List<Map<String, dynamic>> _tiers = [];
  Map<String, dynamic>? _subscription;
  List<Map<String, dynamic>> _privileges = [];
  bool _isPurchasing = false;
  String? _equippingId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadAll();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getMyProfile(),
        _api.getVIPTiers(),
        _api.getUserVIPSubscription(),
        _api.getUserPrivilegesUnified(_api.currentUserId ?? ''),
      ]);

      final profile = results[0] as Map<String, dynamic>?;
      if (mounted && profile != null) {
        _diamonds = profile['coins'] ?? profile['diamond_balance'] ?? 0;
        _tiers = List<Map<String, dynamic>>.from(results[1] as List);
        _subscription = results[2] as Map<String, dynamic>?;
        _privileges = List<Map<String, dynamic>>.from(results[3] as List);
      }
    } catch (e) {
      debugPrint("Error loading VIP data: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handlePurchase(Map<String, dynamic> tier) async {
    if (_isPurchasing) return;
    
    // Check balance
    final int price = tier['price_diamonds'] ?? 0;
    if (_diamonds < price) {
      _showRechargeDialog();
      return;
    }

    // Confirm dialog like web
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28), border: Border.all(color: Colors.purple.withOpacity(0.3))),
        title: Center(child: Text("Confirm VIP Membership", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold))),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            VIPBadge(tier: tier['tier_level'] ?? 1, size: 'lg'),
            const SizedBox(height: 20),
            Text(tier['tier_name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
            Text("${tier['duration_days']} Days Subscription", style: const TextStyle(color: Colors.white60)),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Diamond3DIcon(size: 24),
                  const SizedBox(width: 8),
                  Text(NumberFormat('#,###').format(price), style: GoogleFonts.outfit(color: Colors.amber, fontSize: 24, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel", style: TextStyle(color: Colors.white54))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.purple, foregroundColor: Colors.white),
            child: const Text("Confirm Subscribe"),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isPurchasing = true);
    try {
      final res = await _api.purchaseVIPTier(
        tierId: tier['id'],
        price: price,
        tierLevel: tier['tier_level'] ?? 1,
        durationDays: tier['duration_days'] ?? 30,
      );

      if (res?['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text("🎉 VIP Activated! You are now ${tier['tier_name']}!"),
          backgroundColor: Colors.green,
        ));
        _loadAll();
      } else {
        throw Exception(res?['error'] ?? "Purchase failed");
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _isPurchasing = false);
    }
  }

  void _showRechargeDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text("Insufficient Diamonds", style: TextStyle(color: Colors.white)),
        content: const Text("You need more diamonds to activate this membership.", style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pushNamed(context, '/recharge');
            },
            child: const Text("Recharge Now"),
          ),
        ],
      ),
    );
  }

  Future<void> _handleEquip(Map<String, dynamic> priv) async {
    if (_equippingId != null || priv['is_equipped'] == true) return;

    setState(() => _equippingId = priv['id']);
    try {
      await _api.equipItem(priv['item_id'], priv['category']);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("✨ ${priv['name']} Equipped!")));
      _loadAll();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to equip item"), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _equippingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFF1E1B4B).withOpacity(0.5),
              const Color(0xFF0F1015),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              _buildTabs(),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildPlansTab(),
                    _buildPrivilegesTab(),
                  ],
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
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
            style: IconButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.05)),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("VIP Membership", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              Text("Premium experience & exclusive assets", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12)),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.amber.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                const Diamond3DIcon(size: 16),
                const SizedBox(width: 8),
                Text(NumberFormat('#,###').format(_diamonds), style: GoogleFonts.spaceMono(color: Colors.amber, fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          gradient: const LinearGradient(colors: [Colors.purple, Colors.pink]),
          borderRadius: BorderRadius.circular(12),
        ),
        dividerColor: Colors.transparent,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white38,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold),
        tabs: const [Tab(text: "VIP Plans"), Tab(text: "My Privileges")],
      ),
    );
  }

  Widget _buildPlansTab() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purple));
    
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (_subscription != null) _buildCurrentSubscriptionCard(),
        const SizedBox(height: 20),
        ..._tiers.map((tier) => _buildTierCard(tier)),
      ],
    );
  }

  Widget _buildCurrentSubscriptionCard() {
    final int tierLevel = (_subscription!['vip_tiers']?['tier_level'] as num?)?.toInt() ?? 0;
    return FadeInDown(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [Colors.purple.withOpacity(0.2), Colors.pink.withOpacity(0.2)]),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.purple.withOpacity(0.3)),
        ),
        child: Row(
          children: [
            VIPBadge(tier: tierLevel, size: 'lg'),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Active Membership", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text("Expires: ${DateFormat('MMM dd, yyyy').format(DateTime.parse(_subscription!['expires_at']))}", style: const TextStyle(color: Colors.white60, fontSize: 12)),
                ],
              ),
            ),
            const Icon(LucideIcons.sparkles, color: Colors.purpleAccent),
          ],
        ),
      ),
    );
  }

  Widget _buildTierCard(Map<String, dynamic> tier) {
    final int level = (tier['tier_level'] as num?)?.toInt() ?? 1;
    final int currentLevel = (_subscription?['vip_tiers']?['tier_level'] as num?)?.toInt() ?? 0;
    final bool isOwned = currentLevel >= level;
    
    final List<Color> gradient = _getTierGradient(level);
    
    return FadeInUp(
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B).withOpacity(0.5),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: isOwned ? Colors.green.withOpacity(0.3) : Colors.white.withOpacity(0.05)),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: gradient),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 50, height: 50,
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(15)),
                    child: Center(child: Icon(_getTierIcon(level), color: Colors.white, size: 24)),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tier['tier_name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
                      Text("${tier['duration_days']} Days", style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                    ],
                  ),
                  const Spacer(),
                  if (isOwned) Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(10)), child: const Text("ACTIVE", style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold))),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _buildTierDescription(tier['description']),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Diamond3DIcon(size: 20),
                          const SizedBox(width: 8),
                          Text(NumberFormat('#,###').format(tier['price_diamonds']), style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      ElevatedButton(
                        onPressed: isOwned ? null : () => _handlePurchase(tier),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.purple,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                        ),
                        child: Text(isOwned ? "Active" : "Subscribe"),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTierDescription(String? desc) {
    final List<String> perks = ["Exclusive Frames", "Entry Effects", "VIP Gifts", "Profile Glow"];
    return Wrap(
      spacing: 12, runSpacing: 8,
      children: perks.map((p) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.checkCircle2, color: Colors.purpleAccent, size: 14),
          const SizedBox(width: 4),
          Text(p, style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12)),
        ],
      )).toList(),
    );
  }

  Widget _buildPrivilegesTab() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purple));
    if (_privileges.isEmpty) return _buildEmptyPrivileges();

    final categories = {
      'frame': _privileges.where((p) => p['category'] == 'frame' || p['category'] == 'portrait_frame').toList(),
      'entrance': _privileges.where((p) => p['category'] == 'entrance' || p['category'] == 'entrance_effect' || p['category'] == 'entry_banner').toList(),
      'bubble': _privileges.where((p) => p['category'] == 'bubble' || p['category'] == 'chat_bubble').toList(),
      'vehicle': _privileges.where((p) => p['category'] == 'vehicle').toList(),
    };

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (categories['frame']!.isNotEmpty) _buildCategorySection("👑 Avatar Frames", categories['frame']!),
        if (categories['entrance']!.isNotEmpty) _buildCategorySection("✨ Entry Effects", categories['entrance']!),
        if (categories['bubble']!.isNotEmpty) _buildCategorySection("💬 Chat Bubbles", categories['bubble']!),
        if (categories['vehicle']!.isNotEmpty) _buildCategorySection("🚗 Vehicles", categories['vehicle']!),
      ],
    );
  }

  Widget _buildCategorySection(String title, List<Map<String, dynamic>> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 0.8),
          itemCount: items.length,
          itemBuilder: (context, index) => _buildPrivilegeItem(items[index]),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildPrivilegeItem(Map<String, dynamic> priv) {
    final bool isEquipped = priv['is_equipped'] == true;
    final bool isEquipping = _equippingId == priv['id'];
    final String? animUrl = priv['animation_url'];

    return GestureDetector(
      onTap: () => _handleEquip(priv),
      child: Column(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: isEquipped ? Colors.green.withOpacity(0.5) : Colors.white.withOpacity(0.1)),
                boxShadow: isEquipped ? [BoxShadow(color: Colors.green.withOpacity(0.2), blurRadius: 10)] : null,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (animUrl != null && animUrl.endsWith('.svga'))
                    NetworkSvgaPlayer(url: animUrl)
                  else if (priv['preview_url'] != null)
                    CachedNetworkImage(imageUrl: priv['preview_url'], fit: BoxFit.contain)
                  else
                    const Icon(LucideIcons.box, color: Colors.white24),
                  
                  if (isEquipping) Container(color: Colors.black45, child: const Center(child: CircularProgressIndicator(strokeWidth: 2))),
                  if (isEquipped) const Positioned(top: 8, right: 8, child: Icon(LucideIcons.checkCircle, color: Colors.green, size: 16)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(priv['name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  Widget _buildEmptyPrivileges() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.sparkles, color: Colors.white.withOpacity(0.1), size: 64),
          const SizedBox(height: 16),
          Text("No Privileges Yet", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          Text("Level up or subscribe to VIP to unlock", style: TextStyle(color: Colors.white.withOpacity(0.4))),
          const SizedBox(height: 24),
          ElevatedButton(onPressed: () => _tabController.animateTo(0), style: ElevatedButton.styleFrom(backgroundColor: Colors.purple), child: const Text("View VIP Plans")),
        ],
      ),
    );
  }

  List<Color> _getTierGradient(int level) {
    switch (level) {
      case 6: return [const Color(0xFF9333EA), const Color(0xFFC026D3)];
      case 5: return [const Color(0xFFF43F5E), const Color(0xFFE11D48)];
      case 4: return [const Color(0xFF22D3EE), const Color(0xFF3B82F6)];
      case 3: return [const Color(0xFF94A3B8), const Color(0xFF64748B)];
      case 2: return [const Color(0xFFFBBF24), const Color(0xFFF59E0B)];
      default: return [const Color(0xFF64748B), const Color(0xFF334155)];
    }
  }

  IconData _getTierIcon(int level) {
    if (level >= 5) return LucideIcons.crown;
    if (level >= 3) return LucideIcons.gem;
    return LucideIcons.shield;
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class ManualTopupScreen extends StatefulWidget {
  const ManualTopupScreen({super.key});

  @override
  State<ManualTopupScreen> createState() => _ManualTopupScreenState();
}

class _ManualTopupScreenState extends State<ManualTopupScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  final TextEditingController _uidController = TextEditingController();
  final TextEditingController _diamondController = TextEditingController();
  
  bool _isLoading = true;
  bool _isProcessing = false;
  List<Map<String, dynamic>> _packages = [];
  Map<String, dynamic>? _targetUser;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadPackages();
  }

  Future<void> _loadPackages() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('coin_packages').select('*').order('display_order');
      setState(() {
        _packages = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading packages: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _searchUser() async {
    if (_uidController.text.isEmpty) return;
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('profiles').select('id, app_uid, display_name, avatar_url, coins').eq('app_uid', _uidController.text.trim()).maybeSingle();
      setState(() => _targetUser = res);
    } catch (e) {
      debugPrint("Error searching user: $e");
    }
  }

  Future<void> _executeTopup(int amount) async {
    if (_targetUser == null) return;
    setState(() => _isProcessing = true);
    try {
      final supa = _api.getSupabase();
      // Use the RPC for atomic credit
      await supa.rpc('add_coins', params: {
        'user_id': _targetUser!['id'],
        'amount': amount
      });

      // Log the transaction
      final admin = supa.auth.currentUser;
      await supa.from('admin_logs').insert({
        'admin_id': admin?.id,
        'action_type': 'manual_topup',
        'target_id': _targetUser!['id'],
        'details': {
          'amount': amount,
          'uid': _targetUser!['app_uid'],
          'prev_balance': _targetUser!['coins']
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Successfully credited ${_api.formatNumber(amount)} Diamonds! 💎")));
      _uidController.clear();
      _diamondController.clear();
      setState(() {
        _targetUser = null;
        _isProcessing = false;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildTabs(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTopupInterface(),
                _buildPackageManagement(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("CURRENCY GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Manage diamond packages, exchange rates, and manual coin injection", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.globe, size: 16),
            label: const Text("EXCHANGE RATES"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: const Color(0xFF6366F1),
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
        tabs: const [Tab(text: "MANUAL INJECTION"), Tab(text: "DIAMOND PACKAGES")],
      ),
    );
  }

  Widget _buildTopupInterface() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Target User Search", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                _buildSearchBox(),
                const SizedBox(height: 24),
                if (_targetUser != null) _buildUserPreview(),
              ],
            ),
          ),
          const SizedBox(width: 48),
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Injection Controls", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                _buildInjectionForm(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBox() {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _uidController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(hintText: "Enter User UID...", hintStyle: TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: EdgeInsets.symmetric(horizontal: 20)),
              onSubmitted: (_) => _searchUser(),
            ),
          ),
          IconButton(icon: const Icon(LucideIcons.search, color: Colors.white38), onPressed: _searchUser),
        ],
      ),
    );
  }

  Widget _buildUserPreview() {
    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.2))),
        child: Column(
          children: [
            CircleAvatar(radius: 32, backgroundImage: _targetUser!['avatar_url'] != null ? CachedNetworkImageProvider(_targetUser!['avatar_url']) : null),
            const SizedBox(height: 16),
            Text(_targetUser!['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            Text("UID: ${_targetUser!['app_uid']}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
            const Divider(height: 32, color: Colors.white10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Current Balance:", style: TextStyle(color: Colors.white24, fontSize: 11)),
                Text("${_api.formatNumber(_targetUser!['coins'] ?? 0)} 💎", style: GoogleFonts.robotoMono(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInjectionForm() {
    return Column(
      children: [
        Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
          child: TextField(
            controller: _diamondController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(hintText: "Diamond Amount...", hintStyle: TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: EdgeInsets.symmetric(horizontal: 20)),
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 56,
          child: ElevatedButton.icon(
            onPressed: (_isProcessing || _targetUser == null) ? null : () => _executeTopup(int.parse(_diamondController.text)),
            icon: const Icon(LucideIcons.diamond, size: 16),
            label: Text(_isProcessing ? "PROCESSING..." : "CREDIT DIAMONDS", style: const TextStyle(fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ),
        const SizedBox(height: 16),
        const Text("Warning: This action is irreversible and recorded in the audit logs.", style: TextStyle(color: Colors.redAccent, fontSize: 10)),
      ],
    );
  }

  Widget _buildPackageManagement() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.4),
      itemCount: _packages.length,
      itemBuilder: (context, index) {
        final p = _packages[index];
        final bool isBest = p['is_best_value'] ?? false;
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: isBest ? Colors.amberAccent.withOpacity(0.3) : Colors.white.withOpacity(0.05))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text("${_api.formatNumber(p['coins_amount'])} 💎", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                    if (isBest) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: const Text("BEST VALUE", style: TextStyle(color: Colors.amberAccent, fontSize: 8, fontWeight: FontWeight.bold))),
                  ],
                ),
                const SizedBox(height: 8),
                Text("\$${p['price_usd']}", style: const TextStyle(color: Colors.white38)),
                const Spacer(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text("+${p['discount_percent']}% Bonus", style: const TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                    IconButton(icon: const Icon(LucideIcons.edit3, color: Colors.white24, size: 16), onPressed: () {}),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

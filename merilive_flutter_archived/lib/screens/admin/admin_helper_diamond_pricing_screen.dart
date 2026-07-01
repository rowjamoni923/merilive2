import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminHelperDiamondPricingScreen extends StatefulWidget {
  const AdminHelperDiamondPricingScreen({super.key});

  @override
  State<AdminHelperDiamondPricingScreen> createState() => _AdminHelperDiamondPricingScreenState();
}

class _AdminHelperDiamondPricingScreenState extends State<AdminHelperDiamondPricingScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _prices = [];

  @override
  void initState() {
    super.initState();
    _loadPrices();
  }

  Future<void> _loadPrices() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('helper_diamond_packages').select().order('diamond_amount', ascending: true);
      if (mounted) {
        setState(() {
          _prices = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _deletePackage(String id) async {
    try {
      await _api.getSupabase().from('helper_diamond_packages').delete().eq('id', id);
      _loadPrices();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Package deleted")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Delete failed")));
    }
  }

  void _showPackageDialog([Map<String, dynamic>? pkg]) {
    final bool isEdit = pkg != null;
    final amountController = TextEditingController(text: (pkg?['diamond_amount'] ?? '').toString());
    final priceController = TextEditingController(text: (pkg?['price_usd'] ?? '').toString());
    final descController = TextEditingController(text: pkg?['description'] ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
        title: Text(isEdit ? "EDIT PRICING" : "ADD PRICING TIER", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _dialogInput("Diamond Amount", amountController, TextInputType.number),
            const SizedBox(height: 16),
            _dialogInput("Price (\$ USD)", priceController, const TextInputType.numberWithOptions(decimal: true)),
            const SizedBox(height: 16),
            _dialogInput("Description", descController, TextInputType.text),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("CANCEL", style: TextStyle(color: Colors.white24))),
          ElevatedButton(
            onPressed: () async {
              final payload = {
                'diamond_amount': int.tryParse(amountController.text) ?? 0,
                'price_usd': double.tryParse(priceController.text) ?? 0.0,
                'description': descController.text,
                'is_active': pkg?['is_active'] ?? true,
                'display_order': pkg?['display_order'] ?? _prices.length + 1,
              };

              if (isEdit) {
                await _api.getSupabase().from('helper_diamond_packages').update(payload).eq('id', pkg['id']);
              } else {
                await _api.getSupabase().from('helper_diamond_packages').insert(payload);
              }
              Navigator.pop(ctx);
              _loadPrices();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white),
            child: Text(isEdit ? "UPDATE" : "CREATE"),
          ),
        ],
      ),
    );
  }

  Widget _dialogInput(String label, TextEditingController controller, TextInputType type) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: type,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.white.withOpacity(0.05),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: SingleChildScrollView(
        child: Column(
          children: [
            _buildHeader(),
            _buildInfoCard(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: _isLoading 
                ? const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: Colors.blueAccent)))
                : _buildPricingTable(),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              FadeInLeft(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.cyan, Colors.blueAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.gem, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Helper Diamond Pricing", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Configure diamond amounts per level for the same price", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadPrices,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("Refresh"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard() {
    return FadeInUp(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 40, vertical: 0),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [Colors.cyan.withOpacity(0.1), Colors.blue.withOpacity(0.1)]),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.cyan.withOpacity(0.3)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.cyan, Colors.blue]), borderRadius: BorderRadius.circular(12)),
              child: const Icon(LucideIcons.trendingUp, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Level-Based Diamond Benefits", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text("Higher level helpers get more diamonds for the same price. This incentivizes helpers to upgrade their level for better margins when reselling to users.", 
                    style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPricingTable() {
    return Container(
      margin: const EdgeInsets.only(top: 32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                _tableHeader("LEVEL", flex: 2),
                _tableHeader("DIAMOND AMOUNT", flex: 3),
                _tableHeader("PRICE (USD)", flex: 2),
                _tableHeader("ACTIVE", flex: 1),
                _tableHeader("ACTION", flex: 1),
              ],
            ),
          ),
          ..._prices.asMap().entries.map((entry) {
            final int index = entry.key;
            final Map<String, dynamic> p = entry.value;
            final int level = p['display_order'] ?? (index + 1);
            return _buildTableRow(p, level);
          }).toList(),
        ],
      ),
    );
  }

  Widget _tableHeader(String label, {int flex = 1}) {
    return Expanded(flex: flex, child: Text(label, style: GoogleFonts.outfit(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.2)));
  }

  Widget _buildTableRow(Map<String, dynamic> p, int level) {
    IconData levelIcon = LucideIcons.star;
    Color levelColor = Colors.amber;
    String levelLabel = "Bronze";

    if (level == 2) { levelIcon = LucideIcons.star; levelColor = Colors.blueGrey; levelLabel = "Silver"; }
    else if (level == 3) { levelIcon = LucideIcons.crown; levelColor = Colors.amberAccent; levelLabel = "Gold"; }
    else if (level == 4) { levelIcon = LucideIcons.shield; levelColor = Colors.cyanAccent; levelLabel = "Platinum"; }
    else if (level >= 5) { levelIcon = LucideIcons.gem; levelColor = Colors.cyan; levelLabel = "Diamond"; }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.03))),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: levelColor.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                  child: Icon(levelIcon, color: levelColor, size: 16),
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Level $level", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text(levelLabel, style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 10)),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            flex: 3,
            child: Row(
              children: [
                const Icon(LucideIcons.gem, color: Colors.cyan, size: 14),
                const SizedBox(width: 12),
                SizedBox(
                  width: 120,
                  child: TextField(
                    controller: TextEditingController(text: p['diamond_amount'].toString()),
                    onSubmitted: (val) async {
                      await _api.getSupabase().from('helper_diamond_packages').update({'diamond_amount': int.tryParse(val) ?? 0}).eq('id', p['id']);
                      _loadPrices();
                    },
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(isDense: true, border: OutlineInputBorder(borderRadius: BorderRadius.circular(8))),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Row(
              children: [
                const Icon(LucideIcons.dollarSign, color: Colors.emeraldAccent, size: 14),
                const SizedBox(width: 12),
                SizedBox(
                  width: 100,
                  child: TextField(
                    controller: TextEditingController(text: p['price_usd'].toString()),
                    onSubmitted: (val) async {
                      await _api.getSupabase().from('helper_diamond_packages').update({'price_usd': double.tryParse(val) ?? 0.0}).eq('id', p['id']);
                      _loadPrices();
                    },
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(isDense: true, border: OutlineInputBorder(borderRadius: BorderRadius.circular(8))),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 1,
            child: Switch(
              value: p['is_active'] ?? true,
              onChanged: (val) async {
                await _api.getSupabase().from('helper_diamond_packages').update({'is_active': val}).eq('id', p['id']);
                _loadPrices();
              },
              activeColor: Colors.cyan,
            ),
          ),
          Expanded(
            flex: 1,
            child: IconButton(
              icon: const Icon(LucideIcons.save, color: Colors.white24, size: 18),
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Auto-saved on change"))),
            ),
          ),
        ],
      ),
    );
  }
}

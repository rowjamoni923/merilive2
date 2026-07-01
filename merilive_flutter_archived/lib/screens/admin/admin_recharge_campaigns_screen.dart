import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminRechargeCampaignsScreen extends StatefulWidget {
  const AdminRechargeCampaignsScreen({super.key});

  @override
  State<AdminRechargeCampaignsScreen> createState() => _AdminRechargeCampaignsScreenState();
}

class _AdminRechargeCampaignsScreenState extends State<AdminRechargeCampaignsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _campaigns = [];

  @override
  void initState() {
    super.initState();
    _loadCampaigns();
  }

  Future<void> _loadCampaigns() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('recharge_campaigns').select('*').order('priority', ascending: false);
      setState(() {
        _campaigns = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading campaigns: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleCampaign(String id, bool currentStatus) async {
    try {
      await _api.getSupabase().from('recharge_campaigns').update({'is_active': !currentStatus}).eq('id', id);
      _loadCampaigns();
    } catch (e) {
      debugPrint("Error toggling campaign: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildQuickStats(),
          const SizedBox(height: 24),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.yellowAccent))
              : _buildCampaignsGrid(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(48),
      margin: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFFACC15), Color(0xFFEAB308)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.yellow.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.sparkles, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("CAMPAIGN MANAGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("Create high-converting diamond offers and milestone incentives", style: TextStyle(color: Colors.white70)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus),
            label: const Text("NEW CAMPAIGN"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.2), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickStats() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _statTile("TOTAL", _campaigns.length.toString(), Colors.blueAccent),
          const SizedBox(width: 12),
          _statTile("ACTIVE", _campaigns.where((c) => c['is_active']).length.toString(), Colors.greenAccent),
          const SizedBox(width: 12),
          _statTile("BONUS", _campaigns.where((c) => c['campaign_type'] == 'bonus').length.toString(), Colors.purpleAccent),
          const SizedBox(width: 12),
          _statTile("FIRST-TIME", _campaigns.where((c) => c['campaign_type'] == 'first_recharge').length.toString(), Colors.orangeAccent),
        ],
      ),
    );
  }

  Widget _statTile(String label, String val, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.1))),
      child: Column(
        children: [
          Text(val, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildCampaignsGrid() {
    if (_campaigns.isEmpty) return const Center(child: Text("No campaigns configured", style: TextStyle(color: Colors.white24)));
    
    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.1),
      itemCount: _campaigns.length,
      itemBuilder: (context, index) {
        final c = _campaigns[index];
        final bool isActive = c['is_active'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: isActive ? Colors.yellowAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05)),
              image: c['banner_image_url'] != null ? DecorationImage(image: NetworkImage(c['banner_image_url']), fit: BoxFit.cover, opacity: 0.1) : null,
            ),
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(c['campaign_type'].toString().toUpperCase(), style: const TextStyle(color: Colors.blueAccent, fontSize: 8, fontWeight: FontWeight.bold))),
                    Switch(value: isActive, onChanged: (v) => _toggleCampaign(c['id'], isActive), activeColor: Colors.yellowAccent),
                  ],
                ),
                const SizedBox(height: 16),
                Text(c['campaign_name'], style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18), maxLines: 1, overflow: TextOverflow.ellipsis),
                const Spacer(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _campaignMeta(LucideIcons.diamond, "💎 ${c['diamonds_amount']}"),
                    _campaignMeta(LucideIcons.gift, "+${c['bonus_diamonds']} BONUS", color: Colors.greenAccent),
                  ],
                ),
                const Divider(color: Colors.white05, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _campaignMeta(LucideIcons.clock, "${c['duration_minutes']} MIN"),
                    _campaignMeta(LucideIcons.dollarSign, "\$${c['original_price_usd']}"),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _actionBtn(LucideIcons.edit3, Colors.white24, () {})),
                    const SizedBox(width: 8),
                    Expanded(child: _actionBtn(LucideIcons.trash2, Colors.redAccent, () {})),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _campaignMeta(IconData icon, String val, {Color color = Colors.white70}) {
    return Row(
      children: [
        Icon(icon, color: color.withOpacity(0.5), size: 12),
        const SizedBox(width: 6),
        Text(val, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}

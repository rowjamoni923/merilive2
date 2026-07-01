import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminRewardsManagementScreen extends StatefulWidget {
  const AdminRewardsManagementScreen({super.key});

  @override
  State<AdminRewardsManagementScreen> createState() => _AdminRewardsManagementScreenState();
}

class _AdminRewardsManagementScreenState extends State<AdminRewardsManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _rewards = [];

  @override
  void initState() {
    super.initState();
    _loadRewards();
  }

  Future<void> _loadRewards() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('rewards_config').select().order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _rewards = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
              : _buildRewardsGrid(),
          ),
        ],
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orange]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.award, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("REWARDS MANAGEMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Define and manage game rewards, achievements and platform incentives", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("CREATE NEW REWARD"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildRewardsGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 0.9),
      itemCount: _rewards.length,
      itemBuilder: (context, index) {
        final r = _rewards[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.gift, color: Colors.amberAccent, size: 32)),
                const SizedBox(height: 16),
                Text(r['name'] ?? 'Mystery Prize', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 4),
                Text("${r['amount'] ?? 0} ${r['type'] ?? 'Coins'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _actionIconButton(LucideIcons.edit2, Colors.white12, () {}),
                    const SizedBox(width: 12),
                    _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 14)),
    );
  }
}

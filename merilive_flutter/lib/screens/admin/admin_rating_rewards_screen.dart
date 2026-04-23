import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminRatingRewardsScreen extends StatefulWidget {
  const AdminRatingRewardsScreen({super.key});

  @override
  State<AdminRatingRewardsScreen> createState() => _AdminRatingRewardsScreenState();
}

class _AdminRatingRewardsScreenState extends State<AdminRatingRewardsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _configs = [];

  @override
  void initState() {
    super.initState();
    _loadConfigs();
  }

  Future<void> _loadConfigs() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('rating_reward_config').select().order('star_rating');
      
      if (mounted) {
        setState(() {
          _configs = List<Map<String, dynamic>>.from(res);
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
              : _buildConfigList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.star, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("RATING REWARDS ENGINE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Incentivize app store ratings with automated diamond/item rewards", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("ADD NEW TIER"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildConfigList() {
    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _configs.length,
      itemBuilder: (context, index) {
        final config = _configs[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 20),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              _buildStarRating(config['star_rating'] ?? 0),
              const SizedBox(width: 48),
              _rewardPill("DIAMONDS", "${config['diamond_reward'] ?? 0} 💎", Colors.blueAccent),
              const SizedBox(width: 16),
              _rewardPill("EXP", "+${config['exp_reward'] ?? 0}", Colors.emeraldAccent),
              const Spacer(),
              _actionIconButton(LucideIcons.edit2, Colors.white24, () {}),
              const SizedBox(width: 12),
              _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStarRating(int rating) {
    return Row(
      children: List.generate(5, (i) => Icon(LucideIcons.star, color: i < rating ? Colors.amberAccent : Colors.white10, size: 20)),
    );
  }

  Widget _rewardPill(String label, String val, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.2))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
          Text(val, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 18)),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminRewardClaimsHistoryScreen extends StatefulWidget {
  const AdminRewardClaimsHistoryScreen({super.key});

  @override
  State<AdminRewardClaimsHistoryScreen> createState() => _AdminRewardClaimsHistoryScreenState();
}

class _AdminRewardClaimsHistoryScreenState extends State<AdminRewardClaimsHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _claims = [];

  @override
  void initState() {
    super.initState();
    _loadClaims();
  }

  Future<void> _loadClaims() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('reward_claims').select('*, user:profiles(display_name, app_uid, avatar_url)').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _claims = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
              : _buildClaimsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        children: [
          FadeInLeft(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.emerald, Colors.teal]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.gift, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("REWARD CLAIMS AUDIT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Comprehensive log of all user reward redemptions and item claims", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClaimsList() {
    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _claims.length,
      itemBuilder: (context, index) {
        final c = _claims[index];
        final user = c['user'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              CircleAvatar(radius: 20, backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'Unknown User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("ID: ${user['app_uid']} \u2022 Claimed: ${c['reward_name']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                child: Text(c['reward_type']?.toString().toUpperCase() ?? 'ITEM', style: const TextStyle(color: Colors.blueAccent, fontSize: 9, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 24),
              Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(c['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 10)),
            ],
          ),
        );
      },
    );
  }
}

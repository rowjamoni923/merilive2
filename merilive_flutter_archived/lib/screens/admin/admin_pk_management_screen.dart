import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminPkManagementScreen extends StatefulWidget {
  const AdminPkManagementScreen({super.key});

  @override
  State<AdminPkManagementScreen> createState() => _AdminPkManagementScreenState();
}

class _AdminPkManagementScreenState extends State<AdminPkManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _activePks = [];

  @override
  void initState() {
    super.initState();
    _loadPks();
  }

  Future<void> _loadPks() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      // Fetching active PK sessions
      final res = await supa.from('pk_sessions')
          .select('*, sender:profiles!pk_sessions_sender_id_fkey(display_name, avatar_url), receiver:profiles!pk_sessions_receiver_id_fkey(display_name, avatar_url)')
          .eq('status', 'active')
          .order('created_at', ascending: false);
      
      if (mounted) {
        setState(() {
          _activePks = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _terminatePk(String sessionId) async {
    try {
      await _api.getSupabase().rpc('admin_terminate_pk_session', params: {
        '_session_id': sessionId,
        '_reason': 'Terminated by Admin',
      });
      _loadPks();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("PK Session terminated")));
      }
    } catch (e) {
      debugPrint("Error terminating PK: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          _buildStatsOverview(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
              : _activePks.isEmpty 
                ? const Center(child: Text("No active PK sessions found", style: TextStyle(color: Colors.white24)))
                : ListView.builder(
                    padding: const EdgeInsets.all(40),
                    itemCount: _activePks.length,
                    itemBuilder: (context, index) => _buildPkCard(_activePks[index]),
                  ),
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
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.pinkAccent, Colors.purpleAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.sword, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("PK SESSION GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Monitor live PK battles and intervene in cases of compromises or violations", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          _statItem("ACTIVE PKs", _activePks.length.toString(), LucideIcons.swords, Colors.pinkAccent),
          const SizedBox(width: 20),
          _statItem("TOTAL POINTS", "1.2M", LucideIcons.flame, Colors.orangeAccent),
          const SizedBox(width: 20),
          _statItem("VIOLATIONS", "0", LucideIcons.shieldAlert, Colors.redAccent),
        ],
      ),
    );
  }

  Widget _statItem(String label, String val, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(val, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPkCard(Map<String, dynamic> pk) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildParticipant(pk['sender'], pk['sender_points'] ?? 0),
              Column(
                children: [
                  const Text("VS", style: TextStyle(color: Colors.white10, fontSize: 24, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
                  Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4), decoration: BoxDecoration(color: Colors.pink.withOpacity(0.1), borderRadius: BorderRadius.circular(20)), child: const Text("LIVE", style: TextStyle(color: Colors.pinkAccent, fontSize: 10, fontWeight: FontWeight.bold))),
                ],
              ),
              _buildParticipant(pk['receiver'], pk['receiver_points'] ?? 0),
            ],
          ),
          const SizedBox(height: 24),
          const Divider(color: Colors.white10),
          const SizedBox(height: 24),
          Row(
            children: [
              const Icon(LucideIcons.clock, color: Colors.white24, size: 14),
              const SizedBox(width: 8),
              Text("Started ${DateTime.parse(pk['created_at']).toLocal()}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: () => _terminatePk(pk['id']),
                icon: const Icon(LucideIcons.xCircle, size: 14),
                label: const Text("TERMINATE"),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent.withOpacity(0.1), foregroundColor: Colors.redAccent, elevation: 0, padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Colors.redAccent))),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildParticipant(Map<String, dynamic>? user, int points) {
    return Column(
      children: [
        CircleAvatar(radius: 36, backgroundImage: user?['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user!['avatar_url'], bucket: 'avatars')) : null),
        const SizedBox(height: 12),
        Text(user?['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text("${points.toLocaleString()} PTS", style: const TextStyle(color: Colors.pinkAccent, fontSize: 12, fontWeight: FontWeight.w900)),
      ],
    );
  }
}

extension on int {
  String toLocaleString() => toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},');
}

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminRecordingsScreen extends StatefulWidget {
  const AdminRecordingsScreen({super.key});

  @override
  State<AdminRecordingsScreen> createState() => _AdminRecordingsScreenState();
}

class _AdminRecordingsScreenState extends State<AdminRecordingsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _recordings = [];

  @override
  void initState() {
    super.initState();
    _loadRecordings();
  }

  Future<void> _loadRecordings() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('stream_recordings').select('*, host:profiles(display_name, app_uid)').order('created_at', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _recordings = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _buildRecordingsGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigo]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.video, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("STREAM RECORDINGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Review and manage past live stream recordings and archives", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadRecordings,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("REFRESH ARCHIVE"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingsGrid() {
    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.2),
      itemCount: _recordings.length,
      itemBuilder: (context, index) {
        final r = _recordings[index];
        final host = r['host'] ?? {};
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              children: [
                Expanded(child: ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(24)), child: Image.network(_api.resolveAssetUrl(r['thumbnail_url'], bucket: 'banners'), fit: BoxFit.cover, errorBuilder: (c,e,s) => Container(color: Colors.white.withOpacity(0.05), child: const Icon(LucideIcons.playCircle, color: Colors.white10, size: 40))))),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(host['display_name'] ?? 'Unknown Host', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                            Text("ID: ${host['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                          ],
                        ),
                      ),
                      _actionIconButton(LucideIcons.play, Colors.blueAccent, () {}),
                      const SizedBox(width: 8),
                      _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
                    ],
                  ),
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

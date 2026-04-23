import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminStreamsScreen extends StatefulWidget {
  const AdminStreamsScreen({super.key});

  @override
  State<AdminStreamsScreen> createState() => _AdminStreamsScreenState();
}

class _AdminStreamsScreenState extends State<AdminStreamsScreen> {
  final ApiService _api = ApiService();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: StreamBuilder(
        stream: _api.getSupabase().from('live_streams').stream(primaryKey: ['id']).eq('is_active', true),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator(color: Colors.redAccent));
          final streams = snapshot.data!;

          return Column(
            children: [
              _buildHeader(streams.length),
              Expanded(
                child: streams.isEmpty 
                  ? _buildEmptyState()
                  : _buildStreamGrid(streams),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildHeader(int count) {
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.redAccent, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.radio, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("LIVE STREAMS MONITOR", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    Text("Real-time oversight of $count active broadcasts", style: const TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          _buildQuickActionBtn(),
        ],
      ),
    );
  }

  Widget _buildQuickActionBtn() {
    return ElevatedButton.icon(
      onPressed: () {},
      icon: const Icon(LucideIcons.shieldAlert, size: 16),
      label: const Text("GLOBAL BAN LIST"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildStreamGrid(List<Map<String, dynamic>> streams) {
    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1),
      itemCount: streams.length,
      itemBuilder: (context, index) {
        final stream = streams[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(24)), child: Image.network(_api.resolveAssetUrl(stream['cover_image'], bucket: 'banners'), fit: BoxFit.cover, errorBuilder: (c,e,s) => Container(color: Colors.white.withOpacity(0.05), child: const Icon(LucideIcons.video, color: Colors.white10)))),
                      Positioned(top: 16, left: 16, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.redAccent, borderRadius: BorderRadius.circular(8)), child: const Text("LIVE", style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)))),
                      Positioned(top: 16, right: 16, child: Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(8)), child: Row(children: [const Icon(LucideIcons.users, color: Colors.white, size: 10), const SizedBox(width: 4), Text(stream['viewer_count']?.toString() ?? '0', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold))]))),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(stream['title'] ?? 'Streaming...', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text("ID: ${stream['app_uid'] ?? stream['host_id']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                          ],
                        ),
                      ),
                      _actionIconButton(LucideIcons.externalLink, Colors.blueAccent, () {}),
                      const SizedBox(width: 8),
                      _actionIconButton(LucideIcons.ban, Colors.redAccent, () {}),
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

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.videoOff, color: Colors.white.withOpacity(0.05), size: 100),
          const SizedBox(height: 24),
          const Text("No active streams currently", style: TextStyle(color: Colors.white10, fontSize: 18)),
        ],
      ),
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

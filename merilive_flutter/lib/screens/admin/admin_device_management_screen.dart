import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminDeviceManagementScreen extends StatefulWidget {
  const AdminDeviceManagementScreen({super.key});

  @override
  State<AdminDeviceManagementScreen> createState() => _AdminDeviceManagementScreenState();
}

class _AdminDeviceManagementScreenState extends State<AdminDeviceManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _devices = [];

  @override
  void initState() {
    super.initState();
    _loadDevices();
  }

  Future<void> _loadDevices() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('device_registrations').select('*, user:profiles(display_name, app_uid)').order('last_active_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _devices = List<Map<String, dynamic>>.from(res);
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
              : _buildDeviceList(),
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
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigo]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.smartphone, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("DEVICE MANAGEMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Monitor active devices, manage bans and security protocols", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeviceList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _devices.length,
      itemBuilder: (context, index) {
        final d = _devices[index];
        final user = d['user'] ?? {};
        final bool isBanned = d['is_banned'] ?? false;

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Icon(d['platform'] == 'ios' ? LucideIcons.apple : LucideIcons.play, color: Colors.white24, size: 24),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d['device_model'] ?? 'Unknown Device', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("User: ${user['display_name']} (${user['app_uid']}) \u2022 ID: ${d['device_id']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(d['app_version'] ?? 'v1.0.0', style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: (isBanned ? Colors.redAccent : Colors.greenAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                    child: Text(isBanned ? "BANNED" : "ACTIVE", style: TextStyle(color: isBanned ? Colors.redAccent : Colors.greenAccent, fontSize: 8, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(width: 32),
              _actionIconButton(LucideIcons.shieldAlert, isBanned ? Colors.greenAccent : Colors.redAccent, () {}),
            ],
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 16)),
    );
  }
}

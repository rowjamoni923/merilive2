import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminTodayCallsScreen extends StatefulWidget {
  const AdminTodayCallsScreen({super.key});

  @override
  State<AdminTodayCallsScreen> createState() => _AdminTodayCallsScreenState();
}

class _AdminTodayCallsScreenState extends State<AdminTodayCallsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _calls = [];

  @override
  void initState() {
    super.initState();
    _loadCalls();
  }

  Future<void> _loadCalls() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('call_logs').select('*, host:profiles!call_logs_host_id_fkey(display_name, app_uid), user:profiles!call_logs_user_id_fkey(display_name, app_uid)').gte('created_at', DateTime.now().toIso8601String().split('T')[0]).order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _calls = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
              : _buildCallsList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.pink, Colors.redAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.phoneIncoming, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("TODAY'S LIVE CALLS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Real-time monitoring of successful calls, durations and diamond consumption for today", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          _buildRefreshBtn(),
        ],
      ),
    );
  }

  Widget _buildRefreshBtn() {
    return ElevatedButton.icon(
      onPressed: _loadCalls,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH CALLS"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildCallsList() {
    if (_calls.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.phoneOff, color: Colors.white.withOpacity(0.05), size: 100),
            const SizedBox(height: 24),
            const Text("No calls recorded today yet", style: TextStyle(color: Colors.white10, fontSize: 18)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _calls.length,
      itemBuilder: (context, index) {
        final c = _calls[index];
        final host = c['host'] ?? {};
        final user = c['user'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    _userSnippet(user['display_name'] ?? 'User', user['app_uid'] ?? 'N/A'),
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: Icon(LucideIcons.arrowRight, color: Colors.white10, size: 16)),
                    _userSnippet(host['display_name'] ?? 'Host', host['app_uid'] ?? 'N/A', isHost: true),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("${c['duration'] ?? 0} SECS", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  Text("${c['cost'] ?? 0} 💎", style: const TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(width: 40),
              Text(DateFormat('hh:mm a').format(DateTime.parse(c['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
            ],
          ),
        );
      },
    );
  }

  Widget _userSnippet(String name, String uid, {bool isHost = false}) {
    return Column(
      crossAxisAlignment: isHost ? CrossAxisAlignment.start : CrossAxisAlignment.end,
      children: [
        Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        Text("ID: $uid", style: const TextStyle(color: Colors.white24, fontSize: 11)),
      ],
    );
  }
}

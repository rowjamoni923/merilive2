import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminHostConversionScreen extends StatefulWidget {
  const AdminHostConversionScreen({super.key});

  @override
  State<AdminHostConversionScreen> createState() => _AdminHostConversionScreenState();
}

class _AdminHostConversionScreenState extends State<AdminHostConversionScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _conversions = [];

  @override
  void initState() {
    super.initState();
    _loadConversions();
  }

  Future<void> _loadConversions() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('host_conversion_logs').select('*, host:profiles(display_name, app_uid)').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _conversions = List<Map<String, dynamic>>.from(res);
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
              : _buildConversionsList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.teal]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.refreshCcw, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("HOST BEANS CONVERSION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Audit trail of hosts converting their earned beans into diamonds or withdrawal balance", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadConversions,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH AUDIT"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildConversionsList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _conversions.length,
      itemBuilder: (context, index) {
        final c = _conversions[index];
        final host = c['host'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              const Icon(LucideIcons.coins, color: Colors.amberAccent, size: 20),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(host['display_name'] ?? 'Host', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text("ID: ${host['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("${c['beans_amount'] ?? 0} Beans", style: const TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  const Icon(LucideIcons.arrowDown, color: Colors.white10, size: 12),
                  Text("${c['diamond_amount'] ?? 0} Diamonds", style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                ],
              ),
              const SizedBox(width: 40),
              Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(c['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
            ],
          ),
        );
      },
    );
  }
}

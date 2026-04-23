import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminTopupMethodsScreen extends StatefulWidget {
  const AdminTopupMethodsScreen({super.key});

  @override
  State<AdminTopupMethodsScreen> createState() => _AdminTopupMethodsScreenState();
}

class _AdminTopupMethodsScreenState extends State<AdminTopupMethodsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _methods = [];

  @override
  void initState() {
    super.initState();
    _loadMethods();
  }

  Future<void> _loadMethods() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('topup_payment_methods').select('*').order('display_order', ascending: true);
      setState(() {
        _methods = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading methods: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleMethod(String id, bool currentStatus) async {
    try {
      await _api.getSupabase().from('topup_payment_methods').update({'is_active': !currentStatus}).eq('id', id);
      _loadMethods();
    } catch (e) {
      debugPrint("Error toggling method: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          const SizedBox(height: 24),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
              : _buildMethodsList(),
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
        gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF0D9488)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.emerald.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.creditCard, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("TOPUP METHODS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("Configure manual recharge points and helper payment destination", style: TextStyle(color: Colors.white70)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus),
            label: const Text("ADD METHOD"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.2), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildMethodsList() {
    if (_methods.isEmpty) return const Center(child: Text("No payment methods found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: _methods.length,
      itemBuilder: (context, index) {
        final m = _methods[index];
        final bool isActive = m['is_active'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: isActive ? Colors.emeraldAccent.withOpacity(0.02) : Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? Colors.emeraldAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
                  child: m['icon_url'] != null ? ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network(m['icon_url'], fit: BoxFit.cover)) : const Icon(LucideIcons.smartphone, color: Colors.white24),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text(m['method_type'].toString().toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, letterSpacing: 1)),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m['account_name'] ?? 'No Name', style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
                      Text(m['account_number'] ?? 'No Number', style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Row(
                  children: [
                    _actionBtn(LucideIcons.arrowUp, Colors.white24, () {}),
                    const SizedBox(width: 8),
                    _actionBtn(LucideIcons.arrowDown, Colors.white24, () {}),
                    const SizedBox(width: 8),
                    _actionBtn(LucideIcons.edit3, Colors.blueAccent, () {}),
                    const SizedBox(width: 8),
                    Switch(value: isActive, onChanged: (v) => _toggleMethod(m['id'], isActive), activeColor: Colors.emeraldAccent),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}

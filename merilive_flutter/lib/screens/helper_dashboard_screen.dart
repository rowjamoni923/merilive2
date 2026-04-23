import 'dart:io';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';

class HelperDashboardScreen extends StatefulWidget {
  const HelperDashboardScreen({super.key});

  @override
  State<HelperDashboardScreen> createState() => _HelperDashboardScreenState();
}

class _HelperDashboardScreenState extends State<HelperDashboardScreen> with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  
  Map<String, dynamic>? _helperData;
  List<Map<String, dynamic>> _traderLevels = [];
  Map<String, dynamic>? _currentLevel;
  
  late TabController _tabController;
  final List<int> _packages = [500000, 1000000, 1500000, 2000000, 2500000, 3000000, 4000000, 5000000];
  int? _selectedPackage;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final helperRes = await _supabase.from('topup_helpers').select('*').eq('user_id', user.id).maybeSingle();
      if (helperRes == null) {
        if (mounted) Navigator.pop(context);
        return;
      }

      if (mounted) {
        setState(() {
          _helperData = helperRes;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error: $e');
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('TRADER DASHBOARD', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [Tab(text: 'OVERVIEW'), Tab(text: 'PURCHASE'), Tab(text: 'TRANSFER')],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildOverviewTab(),
          _buildPurchaseTab(),
          const Center(child: Text('Transfer Tab', style: TextStyle(color: Colors.white))),
        ],
      ),
    );
  }

  Widget _buildOverviewTab() {
    final balance = NumberFormat.compact().format(_helperData?['wallet_balance'] ?? 0);
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)]),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                const Text('BALANCE', style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
                Text('$balance 💎', style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPurchaseTab() {
    return GridView.builder(
      padding: const EdgeInsets.all(20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.5),
      itemCount: _packages.length,
      itemBuilder: (ctx, i) {
        final pkg = _packages[i];
        final isSel = _selectedPackage == pkg;
        return GestureDetector(
          onTap: () => setState(() => _selectedPackage = pkg),
          child: Container(
            decoration: BoxDecoration(
              color: isSel ? Colors.cyanAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Text('${(pkg/100000).toStringAsFixed(0)} Lakh 💎', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ),
        );
      },
    );
  }
}



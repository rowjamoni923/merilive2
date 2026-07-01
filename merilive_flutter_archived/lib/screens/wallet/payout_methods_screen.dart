import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class PayoutMethodsScreen extends StatefulWidget {
  const PayoutMethodsScreen({super.key});

  @override
  State<PayoutMethodsScreen> createState() => _PayoutMethodsScreenState();
}

class _PayoutMethodsScreenState extends State<PayoutMethodsScreen> {
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
      final userId = _api.getSupabase().auth.currentUser?.id;
      if (userId != null) {
        final res = await _api.getSupabase()
            .from('user_payout_methods')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);
        setState(() => _methods = List<Map<String, dynamic>>.from(res));
      }
    } catch (e) {
      debugPrint("Payout Methods Error: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildAppBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.greenAccent))
                    : _buildContent(),
                ),
                _buildAddButton(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Text("Payout Methods", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_methods.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ZoomIn(child: Icon(LucideIcons.creditCard, color: Colors.white12, size: 80)),
            const SizedBox(height: 24),
            Text("No payout methods added", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            const Text("Add a payment method to start withdrawing earnings", style: TextStyle(color: Colors.white12, fontSize: 12)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _methods.length,
      itemBuilder: (context, index) {
        final m = _methods[index];
        final type = m['method_type'] ?? 'bank';
        final isPrimary = m['is_primary'] == true;

        return FadeInRight(
          delay: Duration(milliseconds: 100 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: isPrimary 
                ? const LinearGradient(colors: [Color(0xFF059669), Color(0xFF10B981)])
                : LinearGradient(colors: [Colors.white.withOpacity(0.05), Colors.white.withOpacity(0.02)]),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isPrimary ? Colors.transparent : Colors.white12),
            ),
            child: Row(
              children: [
                _buildMethodIcon(type, isPrimary),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m['provider_name'] ?? 'Bank Account', style: TextStyle(color: isPrimary ? Colors.white : Colors.white70, fontWeight: FontWeight.bold, fontSize: 16)),
                      Text(m['account_number'] ?? '**** **** 1234', style: TextStyle(color: isPrimary ? Colors.white70 : Colors.white38, fontSize: 13, letterSpacing: 1)),
                    ],
                  ),
                ),
                if (isPrimary)
                  const Icon(LucideIcons.checkCircle2, color: Colors.white, size: 20),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMethodIcon(String type, bool isPrimary) {
    IconData icon = LucideIcons.building;
    if (type == 'bkash') icon = LucideIcons.smartphone;
    if (type == 'crypto') icon = LucideIcons.shieldCheck;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: isPrimary ? Colors.white.withOpacity(0.2) : Colors.white10, borderRadius: BorderRadius.circular(16)),
      child: Icon(icon, color: Colors.white, size: 24),
    );
  }

  Widget _buildAddButton() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: GestureDetector(
        onTap: () {
          // Future: Show Add Method Modal Parity
        },
        child: Container(
          height: 56,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: Colors.white.withOpacity(0.1), blurRadius: 15)]),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(LucideIcons.plus, color: Color(0xFF0D0D1A), size: 20),
                const SizedBox(width: 12),
                Text("ADD NEW METHOD", style: GoogleFonts.outfit(color: const Color(0xFF0D0D1A), fontWeight: FontWeight.w900, fontSize: 14)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}



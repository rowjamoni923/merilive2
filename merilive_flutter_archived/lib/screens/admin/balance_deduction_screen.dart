import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class BalanceDeductionScreen extends StatefulWidget {
  const BalanceDeductionScreen({super.key});

  @override
  State<BalanceDeductionScreen> createState() => _BalanceDeductionScreenState();
}

class _BalanceDeductionScreenState extends State<BalanceDeductionScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _reasonController = TextEditingController();
  
  bool _isLoading = false;
  bool _isProcessing = false;
  Map<String, dynamic>? _selectedUser;
  String _selectedWallet = 'diamonds';

  Future<void> _searchUser() async {
    if (_searchController.text.isEmpty) return;
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('profiles').select('''
        id, app_uid, display_name, avatar_url, coins, pending_earnings, total_earnings
      ''').eq('app_uid', _searchController.text.trim()).maybeSingle();
      
      setState(() {
        _selectedUser = res;
        _isLoading = false;
      });
      if (res == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("User not found with this UID! 🔍")));
      }
    } catch (e) {
      debugPrint("Error searching user: $e");
      setState(() => _isLoading = false);
    }
  }

  Future<void> _deductBalance() async {
    if (_selectedUser == null || _amountController.text.isEmpty) return;
    
    setState(() => _isProcessing = true);
    try {
      final supa = _api.getSupabase();
      final amount = int.parse(_amountController.text);
      final field = _selectedWallet == 'diamonds' ? 'coins' : 'pending_earnings';
      final currentBal = _selectedUser![field] ?? 0;
      
      if (currentBal < amount) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Insufficient balance for deduction! ❌")));
        setState(() => _isProcessing = false);
        return;
      }

      await supa.from('profiles').update({
        field: currentBal - amount
      }).eq('id', _selectedUser!['id']);

      // Log the action
      final admin = supa.auth.currentUser;
      await supa.from('admin_logs').insert({
        'admin_id': admin?.id,
        'action_type': 'balance_deduction',
        'target_id': _selectedUser!['id'],
        'details': {
          'amount': amount,
          'wallet': _selectedWallet,
          'reason': _reasonController.text,
          'target_uid': _selectedUser!['app_uid']
        }
      });

      _amountController.clear();
      _reasonController.clear();
      _searchUser(); // Refresh user data
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Balance Deducted Successfully! ✅")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Row(
        children: [
          // Left: Search & User Details
          Expanded(
            flex: 2,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 40),
                  _buildSearchBox(),
                  const SizedBox(height: 40),
                  if (_selectedUser != null) _buildUserDetails(),
                ],
              ),
            ),
          ),
          // Right: Deduction Controls
          Expanded(
            flex: 3,
            child: Container(
              margin: const EdgeInsets.all(32),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: _selectedUser == null ? _buildEmptyState() : _buildDeductionControls(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("BALANCE RECONCILIATION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        const Text("Administrative tools for manual balance corrections and accidental credit reversals", style: TextStyle(color: Colors.white38, fontSize: 14)),
      ],
    );
  }

  Widget _buildSearchBox() {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(hintText: "Enter Target UID (e.g. 10001)...", hintStyle: TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: EdgeInsets.symmetric(horizontal: 24)),
              onSubmitted: (_) => _searchUser(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: ElevatedButton(
              onPressed: _isLoading ? null : _searchUser,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              child: _isLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text("SEARCH TARGET"),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUserDetails() {
    return FadeInLeft(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(radius: 32, backgroundImage: _selectedUser!['avatar_url'] != null ? CachedNetworkImageProvider(_selectedUser!['avatar_url']) : null, backgroundColor: Colors.white10),
              const SizedBox(width: 20),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_selectedUser!['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  Text("UID: ${_selectedUser!['app_uid']}", style: const TextStyle(color: Colors.white24)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 40),
          _buildBalanceCard("User Diamonds", _selectedUser!['coins'] ?? 0, LucideIcons.diamond, Colors.blueAccent),
          const SizedBox(height: 12),
          _buildBalanceCard("Host Pending Beans", _selectedUser!['pending_earnings'] ?? 0, LucideIcons.coins, Colors.amberAccent),
        ],
      ),
    );
  }

  Widget _buildBalanceCard(String label, int val, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 16),
              Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ],
          ),
          Text(_api.formatNumber(val), style: GoogleFonts.robotoMono(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
        ],
      ),
    );
  }

  Widget _buildDeductionControls() {
    return FadeIn(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(LucideIcons.minus, color: Colors.redAccent, size: 20),
              const SizedBox(width: 16),
              Text("INITIATE DEDUCTION", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            ]),
            const SizedBox(height: 48),
            const Text("Select Target Wallet", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Row(
              children: [
                _buildWalletOption('diamonds', "DIAMONDS", Colors.blueAccent),
                const SizedBox(width: 12),
                _buildWalletOption('beans', "BEANS", Colors.amberAccent),
              ],
            ),
            const SizedBox(height: 40),
            const Text("Deduction Amount", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _buildInput(_amountController, "Enter amount to remove...", isNumber: true),
            const SizedBox(height: 24),
            const Text("Mandatory Reason", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _buildInput(_reasonController, "e.g. Correction for accidental top-up", maxLines: 3),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 64,
              child: ElevatedButton.icon(
                onPressed: _isProcessing ? null : _deductBalance,
                icon: _isProcessing ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(LucideIcons.ban, size: 18),
                label: Text(_isProcessing ? "PROCESSING..." : "CONFIRM DEDUCTION", style: const TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent.withOpacity(0.1), foregroundColor: Colors.redAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletOption(String id, String label, Color color) {
    final bool isSelected = _selectedWallet == id;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedWallet = id),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: isSelected ? color.withOpacity(0.1) : Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: isSelected ? color.withOpacity(0.5) : Colors.white.withOpacity(0.05))),
          child: Center(child: Text(label, style: TextStyle(color: isSelected ? color : Colors.white24, fontWeight: FontWeight.bold, fontSize: 12))),
        ),
      ),
    );
  }

  Widget _buildInput(TextEditingController controller, String hint, {bool isNumber = false, int maxLines = 1}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: TextField(
        controller: controller,
        keyboardType: isNumber ? TextInputType.number : TextInputType.text,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(hintText: hint, hintStyle: const TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: const EdgeInsets.all(20)),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.search, color: Colors.white.withOpacity(0.05), size: 64),
          const SizedBox(height: 24),
          const Text("Search a user UID to begin reconciliation", style: TextStyle(color: Colors.white10)),
        ],
      ),
    );
  }
}

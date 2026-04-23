import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../services/api_service.dart';

class AdminBalanceDeductionTab extends StatefulWidget {
  const AdminBalanceDeductionTab({super.key});

  @override
  State<AdminBalanceDeductionTab> createState() => _AdminBalanceDeductionTabState();
}

class _AdminBalanceDeductionTabState extends State<AdminBalanceDeductionTab> {
  final ApiService _api = ApiService();
  final TextEditingController _userIdController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _reasonController = TextEditingController();
  bool _isProcessing = false;
  Map<String, dynamic>? _targetUser;

  Future<void> _searchUser() async {
    if (_userIdController.text.isEmpty) return;
    setState(() => _isProcessing = true);
    try {
      final res = await _api.getSupabase().from('profiles').select('id, display_name, username, avatar_url, coins').eq('username', _userIdController.text).maybeSingle();
      setState(() => _targetUser = res);
    } catch (e) {
      debugPrint("Error searching user: $e");
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _deductBalance() async {
    if (_targetUser == null || _amountController.text.isEmpty) return;
    
    bool? confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text("Confirm Deduction", style: TextStyle(color: Colors.white)),
        content: Text("Are you sure you want to deduct ${_amountController.text} 💎 from ${_targetUser!['display_name']}?", style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("CANCEL")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("DEDUCT", style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isProcessing = true);
    try {
      final amount = int.parse(_amountController.text);
      await _api.getSupabase().rpc('admin_deduct_coins', params: {
        '_user_id': _targetUser!['id'],
        '_amount': amount,
        '_reason': _reasonController.text,
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Balance deducted successfully")));
        _userIdController.clear();
        _amountController.clear();
        _reasonController.clear();
        setState(() => _targetUser = null);
      }
    } catch (e) {
      debugPrint("Error deducting balance: $e");
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to deduct balance")));
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.minusCircle, color: Colors.redAccent, size: 24),
                    const SizedBox(width: 16),
                    Text("MANUAL BALANCE DEDUCTION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 32),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      flex: 2,
                      child: _inputField("USER ID / USERNAME", _userIdController, LucideIcons.user),
                    ),
                    const SizedBox(width: 16),
                    ElevatedButton(
                      onPressed: _isProcessing ? null : _searchUser,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, padding: const EdgeInsets.all(20), shape: BorderRadius.circular(12)),
                      child: const Icon(LucideIcons.search, color: Colors.white),
                    ),
                  ],
                ),
                if (_targetUser != null) ...[
                  const SizedBox(height: 32),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.redAccent.withOpacity(0.1))),
                    child: Row(
                      children: [
                        CircleAvatar(backgroundImage: _targetUser!['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(_targetUser!['avatar_url'], bucket: 'avatars')) : null),
                        const SizedBox(width: 20),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(_targetUser!['display_name'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          Text("@${_targetUser!['username']}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                        ])),
                        Text("${_targetUser!['coins']} 💎", style: const TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  Row(
                    children: [
                      Expanded(child: _inputField("DEDUCTION AMOUNT", _amountController, LucideIcons.coins, isNumber: true)),
                      const SizedBox(width: 16),
                      Expanded(flex: 2, child: _inputField("REASON", _reasonController, LucideIcons.fileText)),
                    ],
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isProcessing ? null : _deductBalance,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white, padding: const EdgeInsets.all(24), shape: BorderRadius.circular(16)),
                      child: const Text("EXECUTE DEDUCTION", style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _inputField(String label, TextEditingController controller, IconData icon, {bool isNumber = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: controller,
            keyboardType: isNumber ? TextInputType.number : TextInputType.text,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(border: InputBorder.none, icon: Icon(icon, color: Colors.white24, size: 16)),
          ),
        ),
      ],
    );
  }
}

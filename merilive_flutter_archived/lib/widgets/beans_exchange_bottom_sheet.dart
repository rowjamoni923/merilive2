import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../services/api_service.dart';

class BeansExchangeBottomSheet extends StatefulWidget {
  final Map<String, dynamic> userProfile;
  final Function() onComplete;

  const BeansExchangeBottomSheet({
    super.key,
    required this.userProfile,
    required this.onComplete,
  });

  @override
  State<BeansExchangeBottomSheet> createState() => _BeansExchangeBottomSheetState();
}

class _BeansExchangeBottomSheetState extends State<BeansExchangeBottomSheet> {
  final ApiService _api = ApiService();
  final TextEditingController _amountController = TextEditingController();
  bool _isProcessing = false;

  Future<void> _handleExchange() async {
    final amount = int.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) return;

    setState(() => _isProcessing = true);
    final res = await _api.exchangeBeans(amount: amount);
    if (mounted) setState(() => _isProcessing = false);

    if (res['success'] == true) {
      widget.onComplete();
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("Exchange Beans", style: GoogleFonts.inter(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(hintText: "Amount", hintStyle: TextStyle(color: Colors.white24)),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isProcessing ? null : _handleExchange,
              child: _isProcessing ? const CircularProgressIndicator() : const Text("EXCHANGE"),
            ),
          ),
        ],
      ),
    );
  }
}



import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../services/api_service.dart';

class TransferBottomSheet extends StatefulWidget {
  final Map<String, dynamic> senderProfile;
  final Function() onComplete;

  const TransferBottomSheet({
    super.key,
    required this.senderProfile,
    required this.onComplete,
  });

  @override
  State<TransferBottomSheet> createState() => _TransferBottomSheetState();
}

class _TransferBottomSheetState extends State<TransferBottomSheet> {
  final ApiService _api = ApiService();
  final TextEditingController _amountController = TextEditingController();
  bool _isProcessing = false;

  Future<void> _executeTransfer() async {
    final amount = int.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) return;

    setState(() => _isProcessing = true);
    final res = await _api.transferDiamondsToSelf(amount: amount);
    if (mounted) setState(() => _isProcessing = false);

    if (res['success'] == true) {
      widget.onComplete();
      if (mounted) Navigator.pop(context);
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
          Text("Transfer Diamonds", style: GoogleFonts.inter(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
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
              onPressed: _isProcessing ? null : _executeTransfer,
              child: _isProcessing ? const CircularProgressIndicator() : const Text("TRANSFER"),
            ),
          ),
        ],
      ),
    );
  }
}



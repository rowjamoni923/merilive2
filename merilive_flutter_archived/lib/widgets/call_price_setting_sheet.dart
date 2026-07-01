import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../services/api_service.dart';
import '../services/admin_controller_service.dart';

class CallPriceSettingSheet extends StatefulWidget {
  final int currentPrice;
  final int hostLevel;
  final Function(int) onUpdate;

  const CallPriceSettingSheet({
    super.key,
    required this.currentPrice,
    required this.hostLevel,
    required this.onUpdate,
  });

  @override
  State<CallPriceSettingSheet> createState() => _CallPriceSettingSheetState();
}

class _CallPriceSettingSheetState extends State<CallPriceSettingSheet> {
  final _admin = AdminControllerService();
  final _api = ApiService();
  late int _selectedPrice;
  bool _isUpdating = false;

  @override
  void initState() {
    super.initState();
    _selectedPrice = widget.currentPrice > 0 ? widget.currentPrice : _admin.defaultCallPrice;
  }

  void _handleSave() async {
    setState(() => _isUpdating = true);
    final success = await _api.updateCallPrice(_selectedPrice);
    if (mounted) setState(() => _isUpdating = false);
    if (success) {
      widget.onUpdate(_selectedPrice);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    bool canCustomize = widget.hostLevel >= _admin.minLevelForCustomPrice;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("Call Price", style: GoogleFonts.inter(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          if (!canCustomize)
            Text("Host Level ${_admin.minLevelForCustomPrice}+ required for custom pricing.", style: const TextStyle(color: Colors.amber))
          else
            _buildPriceAdjuster(),
          const SizedBox(height: 40),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isUpdating || !canCustomize ? null : _handleSave,
              child: _isUpdating ? const CircularProgressIndicator() : const Text("Save"),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriceAdjuster() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(icon: const Icon(Icons.remove, color: Colors.white), onPressed: () => setState(() => _selectedPrice = (_selectedPrice - 10).clamp(10, 500))),
        Text("$_selectedPrice", style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
        IconButton(icon: const Icon(Icons.add, color: Colors.white), onPressed: () => setState(() => _selectedPrice = (_selectedPrice + 10).clamp(10, 500))),
      ],
    );
  }
}



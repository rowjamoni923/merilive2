import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../models/payment_gateway_model.dart';

class HelperAcceptedMethodsCard extends StatefulWidget {
  final String helperId;
  final String? countryCode;

  const HelperAcceptedMethodsCard({
    super.key,
    required this.helperId,
    this.countryCode,
  });

  @override
  State<HelperAcceptedMethodsCard> createState() => _HelperAcceptedMethodsCardState();
}

class _HelperAcceptedMethodsCardState extends State<HelperAcceptedMethodsCard> {
  final ApiService _apiService = ApiService();
  List<PaymentGateway> _gateways = [];
  Set<String> _acceptedIds = {};
  bool _loading = true;
  final Set<String> _savingIds = {};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _apiService.getCountryPaymentGateways(widget.countryCode),
        _apiService.getHelperAcceptedGatewayIds(widget.helperId),
      ]);
      _gateways = results[0] as List<PaymentGateway>;
      _acceptedIds = results[1] as Set<String>;
    } catch (e) {
      debugPrint("Error loading methods: $e");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleGateway(String gatewayId, bool currentlyChecked) async {
    setState(() => _savingIds.add(gatewayId));
    try {
      final success = await _apiService.updateHelperAcceptedMethod(
        widget.helperId,
        gatewayId,
        !currentlyChecked,
      );
      if (success) {
        if (currentlyChecked) {
          _acceptedIds.remove(gatewayId);
        } else {
          _acceptedIds.add(gatewayId);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to update method')),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _savingIds.remove(gatewayId));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.cyan.withOpacity(0.15),
            Colors.blue.withOpacity(0.15),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.cyan.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                const Icon(Icons.credit_card, color: Colors.cyanAccent, size: 20),
                const SizedBox(width: 10),
                Text(
                  'Accepted Payment Methods',
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.cyan.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${_acceptedIds.length} selected',
                    style: GoogleFonts.inter(
                      color: Colors.cyanAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.0),
            child: Text(
              'Tick the methods you accept. Users will see these logos on your card in the Recharge page.',
              style: TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(30.0),
                child: CircularProgressIndicator(color: Colors.cyanAccent),
              ),
            )
          else if (_gateways.isEmpty)
            _buildEmptyState()
          else
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: 2.2,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: _gateways.length,
                itemBuilder: (context, index) {
                  final gateway = _gateways[index];
                  final isChecked = _acceptedIds.contains(gateway.id);
                  final isSaving = _savingIds.contains(gateway.id);

                  return _buildGatewayButton(gateway, isChecked, isSaving);
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.cyan.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.cyan.withOpacity(0.1)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.lightbulb_outline, color: Colors.cyanAccent, size: 14),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Logos automatically appear on your Recharge card so users instantly know which methods you support.',
                      style: GoogleFonts.inter(
                        color: Colors.cyan.withOpacity(0.8),
                        fontSize: 9,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGatewayButton(PaymentGateway gateway, bool isChecked, bool isSaving) {
    return InkWell(
      onTap: isSaving ? null : () => _toggleGateway(gateway.id, isChecked),
      borderRadius: BorderRadius.circular(15),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: isChecked 
              ? Colors.cyan.withOpacity(0.2) 
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(
            color: isChecked ? Colors.cyanAccent : Colors.white10,
            width: isChecked ? 1.5 : 1,
          ),
          boxShadow: isChecked ? [
            BoxShadow(
              color: Colors.cyanAccent.withOpacity(0.1),
              blurRadius: 8,
              spreadRadius: 1,
            )
          ] : null,
        ),
        child: Stack(
          children: [
            Row(
              children: [
                // Custom Checkbox
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: isChecked ? Colors.cyanAccent : Colors.transparent,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: isChecked ? Colors.cyanAccent : Colors.white38,
                    ),
                  ),
                  child: isChecked 
                      ? const Icon(Icons.check, size: 10, color: Colors.black87) 
                      : null,
                ),
                const SizedBox(width: 8),
                // Logo
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: gateway.logoUrl != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            gateway.logoUrl!,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Center(
                              child: Text('💳', style: TextStyle(fontSize: 12)),
                            ),
                          ),
                        )
                      : const Center(child: Text('💳', style: TextStyle(fontSize: 12))),
                ),
                const SizedBox(width: 8),
                // Name & Type
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        gateway.name,
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Row(
                        children: [
                          Text(
                            gateway.isIntegrated ? '⚡ Auto' : '📝 Manual',
                            style: GoogleFonts.inter(
                              color: gateway.isIntegrated ? Colors.greenAccent : Colors.amberAccent,
                              fontSize: 8,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          if (gateway.countryCodes.contains('GLOBAL'))
                            const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Text('🌍', style: TextStyle(fontSize: 8)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (isSaving)
              const Positioned(
                top: 0,
                right: 0,
                child: SizedBox(
                  width: 10,
                  height: 10,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.cyanAccent,
                  ),
                ),
              )
            else if (isChecked)
              const Positioned(
                top: 0,
                right: 0,
                child: Icon(Icons.check_circle, color: Colors.cyanAccent, size: 12),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.amber.withOpacity(0.05),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.amber.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Text(
            'No payment gateways available for ${widget.countryCode ?? "your country"}',
            style: GoogleFonts.inter(color: Colors.amberAccent, fontSize: 13, fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          const Text(
            'Admin has not enabled any methods yet.',
            style: TextStyle(color: Colors.white70, fontSize: 11),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}



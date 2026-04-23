import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyWithdrawalScreen extends StatefulWidget {
  final Map<String, dynamic> agency;
  const AgencyWithdrawalScreen({super.key, required this.agency});

  @override
  State<AgencyWithdrawalScreen> createState() => _AgencyWithdrawalScreenState();
}

class _AgencyWithdrawalScreenState extends State<AgencyWithdrawalScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _amountController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSubmitting = false;
  String _selectedMethod = 'bkash';
  double _beansToUsdRate = 9000.0;
  double _usdToLocalRate = 110.0;
  Map<String, dynamic>? _countryConfig;
  Map<String, dynamic>? _feesConfig;
  List<Map<String, dynamic>> _history = [];
  
  final TextEditingController _accountNumberController = TextEditingController();
  final TextEditingController _accountNameController = TextEditingController();

  final List<Map<String, dynamic>> _methods = [
    {'id': 'bkash', 'name': 'bKash', 'icon': LucideIcons.smartphone, 'color': Colors.pinkAccent},
    {'id': 'nagad', 'name': 'Nagad', 'icon': LucideIcons.smartphone, 'color': Colors.orangeAccent},
    {'id': 'rocket', 'name': 'Rocket', 'icon': LucideIcons.smartphone, 'color': Colors.deepPurpleAccent},
    {'id': 'bank', 'name': 'Bank Wire', 'icon': LucideIcons.building2, 'color': Colors.blueAccent},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final finance = await _api.getFinanceSettings();
      _beansToUsdRate = finance['beans_per_usd']?.toDouble() ?? 9000.0;
      _feesConfig = finance['withdrawal_fees'];

      final profile = await _api.getMyProfile();
      if (profile?['country_code'] != null) {
        _countryConfig = await _api.getCountryConfig(profile['country_code']);
        _usdToLocalRate = _countryConfig?['rate_to_usd']?.toDouble() ?? 1.0;
        
        if (_countryConfig?['payment_methods'] != null && (_countryConfig?['payment_methods'] as List).isNotEmpty) {
           _selectedMethod = _countryConfig?['payment_methods'][0];
        }
      }

      final agencyId = widget.agency['id'];
      if (agencyId != null) {
        _history = await _api.getAgencyWithdrawalHistory(agencyId);
      }
    } catch (e) {
      debugPrint("Parity Withdraw Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  double _calculateFee(double usdAmount) {
    if (_feesConfig == null) return 1.0;
    final tiers = _feesConfig!['tiers'] as List?;
    if (tiers == null) return 1.0;

    for (var tier in tiers) {
      if (usdAmount >= (tier['min'] ?? 0) && usdAmount <= (tier['max'] ?? 999999)) {
        return (tier['fee'] ?? 1.0).toDouble();
      }
    }
    return 1.0;
  }

  Future<void> _handleWithdraw() async {
    final amountText = _amountController.text.trim();
    if (amountText.isEmpty) return;
    
    final beansAmount = int.tryParse(amountText) ?? 0;
    if (beansAmount < _beansToUsdRate * 10) {
      _showError("Min withdrawal: \$10 (${NumberFormat('#,###').format(_beansToUsdRate * 10)} Beans)");
      return;
    }

    final balance = widget.agency['wallet_balance'] ?? widget.agency['beans_balance'] ?? 0;
    if (beansAmount > balance) {
      _showError("Insufficient Balance");
      return;
    }

    final accNum = _accountNumberController.text.trim();
    final accName = _accountNameController.text.trim();
    
    if (accNum.isEmpty || accName.isEmpty) {
      _showError("Enter account details");
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final usdAmount = beansAmount / _beansToUsdRate;
      final feeUsd = _calculateFee(usdAmount);
      final netUsd = usdAmount - feeUsd;

      final res = await _api.requestAgencyWithdrawal(
        agencyId: widget.agency['id'],
        amountUsd: usdAmount,
        beansAmount: beansAmount,
        feeUsd: feeUsd,
        netUsd: netUsd,
        method: _selectedMethod,
        details: "$accNum • $accName",
      );

      if (res['success'] == true) {
         _showSuccessDialog();
         _loadData();
      } else {
        _showError(res['error'] ?? "Request failed");
      }
    } catch (e) {
      _showError("Error: $e");
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.redAccent, behavior: SnackBarBehavior.floating));
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      builder: (context) => FadeInUp(
        child: AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
          title: Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.check, color: Colors.greenAccent, size: 20)),
              const SizedBox(width: 12),
              Text("Request Sent", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Text("Your withdrawal request is now in queue for review. You can track progress in the history below.", style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 13)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text("UNDERSTOOD", style: GoogleFonts.outfit(color: Colors.cyanAccent, fontWeight: FontWeight.bold)))
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.cyanAccent)));

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                    physics: const BouncingScrollPhysics(),
                    child: Column(
                      children: [
                        _buildBalanceCard(),
                        const SizedBox(height: 32),
                        _buildMethodSelector(),
                        const SizedBox(height: 32),
                        _buildInputSection(),
                        const SizedBox(height: 48),
                        _buildHistorySection(),
                        const SizedBox(height: 40),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Revenue Settlement", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Agency Finance", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard() {
    final beans = widget.agency['wallet_balance'] ?? widget.agency['beans_balance'] ?? 0;
    final usd = beans / _beansToUsdRate;
    final local = usd * _usdToLocalRate;
    final String currencyCode = _countryConfig?['currency_code'] ?? "USD";

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFF59E0B)]),
        borderRadius: BorderRadius.circular(40),
        boxShadow: [BoxShadow(color: Colors.orange.withOpacity(0.3), blurRadius: 40, offset: const Offset(0, 15))],
      ),
      child: Column(
        children: [
          Text("AVAILABLE REVENUE", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
          const SizedBox(height: 12),
          Text(NumberFormat('#,###').format(beans), style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900)),
          Text("BEANS", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.5), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(color: Colors.black.withOpacity(0.15), borderRadius: BorderRadius.circular(20)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text("\$${usd.toStringAsFixed(2)} USD", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Container(width: 1, height: 16, color: Colors.white24, margin: const EdgeInsets.symmetric(horizontal: 16)),
                Text("${NumberFormat.simpleCurrency(name: currencyCode).format(local)}", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMethodSelector() {
    final methods = (_countryConfig?['payment_methods'] as List?) ?? ['bkash', 'nagad', 'bank'];
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("SETTLEMENT METHOD", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 16),
        SizedBox(
          height: 100,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: methods.length,
            itemBuilder: (context, index) {
              final mId = methods[index];
              bool isSel = _selectedMethod == mId;
              final Map<String, dynamic> m = _methods.firstWhere((e) => e['id'] == mId, orElse: () => {'name': mId.toUpperCase(), 'icon': LucideIcons.smartphone, 'color': Colors.cyanAccent});

              return GestureDetector(
                onTap: () => setState(() => _selectedMethod = mId),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 110,
                  margin: const EdgeInsets.only(right: 12),
                  decoration: BoxDecoration(
                    color: isSel ? (m['color'] as Color).withOpacity(0.1) : Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: isSel ? (m['color'] as Color).withOpacity(0.5) : Colors.white.withOpacity(0.05), width: 2),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(m['icon'], color: isSel ? (m['color'] as Color) : Colors.white24, size: 28),
                      const SizedBox(height: 10),
                      Text(m['name'], style: GoogleFonts.outfit(color: isSel ? Colors.white : Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildInputSection() {
    final amountText = _amountController.text.trim();
    final beansAmount = int.tryParse(amountText) ?? 0;
    final usdAmount = beansAmount / _beansToUsdRate;
    final feeUsd = _calculateFee(usdAmount);
    final netUsd = usdAmount - feeUsd;
    final localValue = (netUsd > 0 ? netUsd : 0) * _usdToLocalRate;
    final currencyCode = _countryConfig?['currency_code'] ?? "USD";

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("WITHDRAWAL QUANTITY", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          height: 60,
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: TextField(
            controller: _amountController,
            onChanged: (_) => setState(() {}),
            keyboardType: TextInputType.number,
            style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
            decoration: InputDecoration(border: InputBorder.none, hintText: "0.00 BEANS", hintStyle: TextStyle(color: Colors.white.withOpacity(0.05))),
          ),
        ),
        if (beansAmount > 0) ...[
          const SizedBox(height: 16),
          FadeIn(
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(28), border: Border.all(color: Colors.white.withOpacity(0.03))),
              child: Column(
                children: [
                  _buildFeeRow("Estimated Platform Fee", "\$${feeUsd.toStringAsFixed(2)}", Colors.redAccent),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider(color: Colors.white10, height: 1)),
                  _buildFeeRow("Net Settlement", "${NumberFormat.simpleCurrency(name: currencyCode).format(localValue)}", Colors.greenAccent),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 32),
        Text("ACCOUNT CREDENTIALS", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 12),
        _buildTextField(_accountNumberController, "Account Number / ID", LucideIcons.hash),
        const SizedBox(height: 12),
        _buildTextField(_accountNameController, "Account Legal Name", LucideIcons.user),
        const SizedBox(height: 40),
        SizedBox(
          width: double.infinity,
          height: 60,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6366F1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              elevation: 0,
              shadowColor: Colors.blue.withOpacity(0.5),
            ),
            onPressed: _isSubmitting ? null : _handleWithdraw,
            child: _isSubmitting 
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : Text("INITIALIZE SETTLEMENT", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 15, letterSpacing: 1)),
          ),
        ),
      ],
    );
  }

  Widget _buildFeeRow(String label, String value, Color valColor) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 13, fontWeight: FontWeight.bold)),
        Text(value, style: GoogleFonts.spaceMono(color: valColor, fontWeight: FontWeight.w900, fontSize: 16)),
      ],
    );
  }

  Widget _buildTextField(TextEditingController controller, String hint, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      height: 56,
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white, fontSize: 15),
        decoration: InputDecoration(
          border: InputBorder.none, 
          hintText: hint, 
          hintStyle: TextStyle(color: Colors.white.withOpacity(0.05)),
          prefixIcon: Icon(icon, color: Colors.white.withOpacity(0.2), size: 18),
        ),
      ),
    );
  }

  Widget _buildHistorySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("SETTLEMENT LOGS", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 16),
        if (_history.isEmpty)
          Center(child: Padding(padding: const EdgeInsets.all(40), child: Column(children: [Icon(LucideIcons.history, color: Colors.white10, size: 48), const SizedBox(height: 12), Text("No previous settlements", style: TextStyle(color: Colors.white.withOpacity(0.1)))])))
        else
          ..._history.take(5).map((h) => _buildHistoryItem(h)).toList(),
      ],
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> h) {
    final status = h['status'] ?? 'pending';
    final date = DateTime.tryParse(h['created_at'] ?? '') ?? DateTime.now();
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("${NumberFormat('#,###').format(h['amount_beans'] ?? 0)} Beans", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              Text(DateFormat('MMM dd, yyyy • HH:mm').format(date), style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 11)),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: status == 'approved' ? Colors.greenAccent.withOpacity(0.1) : status == 'rejected' ? Colors.redAccent.withOpacity(0.1) : Colors.amberAccent.withOpacity(0.1), 
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(status.toUpperCase(), style: TextStyle(color: status == 'approved' ? Colors.greenAccent : status == 'rejected' ? Colors.redAccent : Colors.amberAccent, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1)),
          ),
        ],
      ),
    );
  }
}



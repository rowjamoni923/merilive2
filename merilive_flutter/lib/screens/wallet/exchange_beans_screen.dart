import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../services/admin_controller_service.dart';
import '../../widgets/nebula_background.dart';

class ExchangeBeansScreen extends StatefulWidget {
  const ExchangeBeansScreen({super.key});

  @override
  State<ExchangeBeansScreen> createState() => _ExchangeBeansScreenState();
}

class _ExchangeBeansScreenState extends State<ExchangeBeansScreen> {
  final _api = ApiService();
  final _amountController = TextEditingController();
  bool _isLoading = false;
  int _myBeans = 0;
  Map<String, dynamic> _settings = {};
  
  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final settings = await _api.getFinanceSettings();
      if (mounted) {
        setState(() {
          _myBeans = profile?['beans_balance'] ?? profile?['beans'] ?? 0;
          _settings = settings;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.redAccent, content: Text(msg)));
  }

  void _showSuccess(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.green, content: Text(msg)));
  }

  Future<void> _handleExchange() async {
    final amount = int.tryParse(_amountController.text) ?? 0;
    final minAmount = _settings['min_exchange_amount'] ?? 100000;
    
    if (amount < minAmount) { _showError("Minimum exchange is ${NumberFormat('#,###').format(minAmount)} Beans"); return; }
    if (amount > _myBeans) { _showError("Insufficient beans"); return; }

    setState(() => _isLoading = true);
    try {
      final res = await _api.exchangeBeansToDiamonds(amount);
      if (res['success'] == true) {
        _showSuccess("Exchange Successful!");
        _amountController.clear();
        await _fetchData();
      } else {
        _showError(res['error'] ?? "Exchange Failed");
      }
    } catch (e) {
      _showError("An error occurred during exchange");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final double rate = _settings['beans_to_diamonds_rate']?.toDouble() ?? 1.0;
    final int feePercent = _settings['exchange_fee_percent'] ?? 25;
    
    final int inputAmount = int.tryParse(_amountController.text) ?? 0;
    final double rawDiamonds = inputAmount / rate;
    final int fee = (rawDiamonds * (feePercent / 100)).floor();
    final int expectedDiamonds = (rawDiamonds - fee).floor();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: _isLoading && _myBeans == 0
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
              : Column(
                  children: [
                    _buildAppBar(),
                    Expanded(
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                        child: Column(
                          children: [
                            _buildBalanceCard(),
                            const SizedBox(height: 32),
                            _buildExchangeSection(expectedDiamonds, fee),
                            const SizedBox(height: 40),
                            _buildInfoCard(rate, feePercent, (int.tryParse(_settings['min_exchange_amount']?.toString() ?? '100000') ?? 100000)),
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

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Text(
            "DIAMOND EXCHANGE",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 1),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(LucideIcons.history, color: Colors.white70, size: 20),
            onPressed: () => Navigator.pushNamed(context, '/bean-history'),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
          begin: Alignment.topLeft, end: Alignment.bottomRight
        ),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(color: Colors.amber.withOpacity(0.3), blurRadius: 25, offset: const Offset(0, 12))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                child: const Icon(LucideIcons.bean, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 12),
              Text(
                "MY BEANS",
                style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            NumberFormat('#,###').format(_myBeans),
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 42, fontWeight: FontWeight.w900),
          ),
          Text(
            "Exchangeable for diamonds",
            style: GoogleFonts.outfit(color: Colors.white60, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildExchangeSection(int expected, int fee) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel("CONVERT TO DIAMONDS"),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white10),
          ),
          child: Column(
            children: [
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                onChanged: (v) => setState(() {}),
                decoration: InputDecoration(
                  hintText: "Enter amount",
                  hintStyle: const TextStyle(color: Colors.white10),
                  border: InputBorder.none,
                  suffixIcon: TextButton(
                    onPressed: () => setState(() => _amountController.text = _myBeans.toString()),
                    child: const Text("MAX", style: TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
              const Divider(color: Colors.white10, height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("You will receive", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 13)),
                  Row(
                    children: [
                      const Icon(LucideIcons.gem, color: Colors.cyanAccent, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        NumberFormat('#,###').format(expected),
                        style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        if (fee > 0)
          Padding(
            padding: const EdgeInsets.only(top: 12, left: 8),
            child: Text(
              "- Processing Fee: ${NumberFormat('#,###').format(fee)} Diamonds",
              style: GoogleFonts.outfit(color: Colors.redAccent.withOpacity(0.7), fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        const SizedBox(height: 48),
        SizedBox(
          width: double.infinity,
          height: 64,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _handleExchange,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              elevation: 8,
              shadowColor: Colors.amber.withOpacity(0.4),
            ),
            child: _isLoading 
              ? const CircularProgressIndicator(color: Colors.white)
              : Text("CONFIRM EXCHANGE", style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1)),
          ),
        ),
      ],
    );
  }

  Widget _buildInfoCard(double rate, int fee, int min) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        children: [
          _infoRow("Exchange Rate", "1 Bean = ${1/rate} Diamond"),
          const SizedBox(height: 16),
          _infoRow("Processing Fee", "$fee% Deducted"),
          const SizedBox(height: 16),
          _infoRow("Minimum Exchange", "${NumberFormat('#,###').format(min)} Beans"),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 13)),
        Text(value, style: GoogleFonts.outfit(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: GoogleFonts.outfit(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5),
    );
  }
}

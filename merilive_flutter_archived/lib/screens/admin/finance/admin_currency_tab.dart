import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../services/api_service.dart';

class AdminCurrencyTab extends StatefulWidget {
  const AdminCurrencyTab({super.key});

  @override
  State<AdminCurrencyTab> createState() => _AdminCurrencyTabState();
}

class _AdminCurrencyTabState extends State<AdminCurrencyTab> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  bool _isSaving = false;
  double _beansToUsdRate = 10000;
  List<Map<String, dynamic>> _currencies = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Load beans to usd rate from app_settings
      final settingsRes = await supa.from('app_settings').select('setting_value').eq('setting_key', 'beans_to_usd_rate').maybeSingle();
      if (settingsRes != null && settingsRes['setting_value'] != null) {
        _beansToUsdRate = (settingsRes['setting_value']['rate'] ?? 10000).toDouble();
      }

      // Load currency rates
      final currenciesRes = await supa.from('currency_rates').select('*').order('country_code');
      _currencies = List<Map<String, dynamic>>.from(currenciesRes);

      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Error loading currency data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveBeansToUsdRate() async {
    setState(() => _isSaving = true);
    try {
      await _api.getSupabase().from('app_settings').upsert({
        'setting_key': 'beans_to_usd_rate',
        'setting_value': {'rate': _beansToUsdRate},
        'description': 'Beans to USD exchange rate',
        'updated_at': DateTime.now().toIso8601String(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Exchange rate saved successfully")));
      }
    } catch (e) {
      debugPrint("Error saving rate: $e");
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildRateCard(),
          const SizedBox(height: 40),
          Text("INTERNATIONAL CURRENCY RATES", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          _buildCurrencyGrid(),
        ],
      ),
    );
  }

  Widget _buildRateCard() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.coins, color: Colors.amberAccent, size: 24),
              const SizedBox(width: 16),
              Text("BEANS TO USD RATE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("Beans Amount (per \$1 USD)", style: TextStyle(color: Colors.white38, fontSize: 12)),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
                      child: TextField(
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                        decoration: const InputDecoration(border: InputBorder.none),
                        onChanged: (v) => _beansToUsdRate = double.tryParse(v) ?? _beansToUsdRate,
                        controller: TextEditingController(text: _beansToUsdRate.toInt().toString()),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 24),
              ElevatedButton(
                onPressed: _isSaving ? null : _saveBeansToUsdRate,
                style: ElevatedButton.styleFrom(backgroundColor: Colors.emeraldAccent, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20), shape: BorderRadius.circular(12)),
                child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text("SAVE RATE", style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCurrencyGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 2),
      itemCount: _currencies.length,
      itemBuilder: (context, index) {
        final c = _currencies[index];
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(c['country_code'] ?? '', style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold))),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(c['currency_code'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text("${c['currency_symbol']}${c['rate_to_usd']}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

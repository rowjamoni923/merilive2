import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminCoinsScreen extends StatefulWidget {
  const AdminCoinsScreen({super.key});

  @override
  State<AdminCoinsScreen> createState() => _AdminCoinsScreenState();
}

class _AdminCoinsScreenState extends State<AdminCoinsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  bool _isSaving = false;
  List<Map<String, dynamic>> _packages = [];
  List<Map<String, dynamic>> _currencies = [];
  double _beansToUsdRate = 10000.0;

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final packages = await supa.from('coin_packages').select().order('display_order');
      final currencies = await supa.from('currency_rates').select().order('country_code');
      final settings = await supa.from('app_settings').select().eq('key', 'beans_to_usd_rate').maybeSingle();

      if (mounted) {
        setState(() {
          _packages = List<Map<String, dynamic>>.from(packages);
          _currencies = List<Map<String, dynamic>>.from(currencies);
          if (settings != null && settings['value'] != null) {
            _beansToUsdRate = (settings['value']['rate'] ?? 10000.0).toDouble();
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _deletePackage(String id) async {
    try {
      await _api.getSupabase().from('coin_packages').delete().eq('id', id);
      _fetchData();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Package deleted")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to delete")));
    }
  }

  Future<void> _deleteCurrency(String id) async {
    try {
      await _api.getSupabase().from('currency_rates').delete().eq('id', id);
      _fetchData();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Currency deleted")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to delete")));
    }
  }

  void _showPackageDialog([Map<String, dynamic>? pkg]) {
    final bool isEdit = pkg != null;
    final coinsController = TextEditingController(text: (pkg?['coins_amount'] ?? '').toString());
    final bonusController = TextEditingController(text: (pkg?['bonus_coins'] ?? '0').toString());
    final priceController = TextEditingController(text: (pkg?['price_usd'] ?? '').toString());
    final nameController = TextEditingController(text: pkg?['name'] ?? '');
    bool isPopular = pkg?['is_popular'] ?? false;
    bool isActive = pkg?['is_active'] ?? true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
          title: Text(isEdit ? "EDIT PACKAGE" : "NEW DIAMOND PACKAGE", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _dialogInput("Base Diamonds", coinsController, TextInputType.number),
                const SizedBox(height: 16),
                _dialogInput("Bonus Diamonds", bonusController, TextInputType.number),
                const SizedBox(height: 16),
                _dialogInput("Price (\$ USD)", priceController, const TextInputType.numberWithOptions(decimal: true)),
                const SizedBox(height: 16),
                _dialogInput("Package Name", nameController, TextInputType.text),
                const SizedBox(height: 16),
                SwitchListTile(
                  title: const Text("Is Popular?", style: TextStyle(color: Colors.white70, fontSize: 13)),
                  value: isPopular,
                  onChanged: (v) => setDialogState(() => isPopular = v),
                  activeColor: Colors.cyanAccent,
                ),
                SwitchListTile(
                  title: const Text("Is Active?", style: TextStyle(color: Colors.white70, fontSize: 13)),
                  value: isActive,
                  onChanged: (v) => setDialogState(() => isActive = v),
                  activeColor: Colors.cyanAccent,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("CANCEL", style: TextStyle(color: Colors.white24))),
            ElevatedButton(
              onPressed: () async {
                final payload = {
                  'coins_amount': int.tryParse(coinsController.text) ?? 0,
                  'bonus_coins': int.tryParse(bonusController.text) ?? 0,
                  'price_usd': double.tryParse(priceController.text) ?? 0.0,
                  'name': nameController.text.isEmpty ? "${coinsController.text} Diamonds" : nameController.text,
                  'is_popular': isPopular,
                  'is_active': isActive,
                  'display_order': pkg?['display_order'] ?? _packages.length + 1,
                  'product_id': "diamonds_${coinsController.text}",
                };

                if (isEdit) {
                  await _api.getSupabase().from('coin_packages').update(payload).eq('id', pkg['id']);
                } else {
                  await _api.getSupabase().from('coin_packages').insert(payload);
                }
                Navigator.pop(ctx);
                _fetchData();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.cyanAccent, foregroundColor: Colors.black),
              child: Text(isEdit ? "SAVE CHANGES" : "CREATE PACKAGE"),
            ),
          ],
        ),
      ),
    );
  }

  void _showCurrencyDialog([Map<String, dynamic>? currency]) {
    final bool isEdit = currency != null;
    final codeController = TextEditingController(text: currency?['currency_code'] ?? '');
    final countryController = TextEditingController(text: currency?['country_code'] ?? '');
    final symbolController = TextEditingController(text: currency?['currency_symbol'] ?? '');
    final rateController = TextEditingController(text: (currency?['rate_to_usd'] ?? '').toString());
    bool isActive = currency?['is_active'] ?? true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
          title: Text(isEdit ? "EDIT CURRENCY" : "ADD NEW CURRENCY", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(child: _dialogInput("Code (USD)", codeController, TextInputType.text)),
                  const SizedBox(width: 12),
                  Expanded(child: _dialogInput("Country (US)", countryController, TextInputType.text)),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _dialogInput("Symbol (\$)", symbolController, TextInputType.text)),
                  const SizedBox(width: 12),
                  Expanded(child: _dialogInput("Rate to \$1", rateController, const TextInputType.numberWithOptions(decimal: true))),
                ],
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                title: const Text("Is Active?", style: TextStyle(color: Colors.white70, fontSize: 13)),
                value: isActive,
                onChanged: (v) => setDialogState(() => isActive = v),
                activeColor: Colors.emeraldAccent,
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("CANCEL", style: TextStyle(color: Colors.white24))),
            ElevatedButton(
              onPressed: () async {
                final payload = {
                  'currency_code': codeController.text.toUpperCase(),
                  'country_code': countryController.text.toUpperCase(),
                  'currency_symbol': symbolController.text,
                  'rate_to_usd': double.tryParse(rateController.text) ?? 1.0,
                  'is_active': isActive,
                };

                if (isEdit) {
                  await _api.getSupabase().from('currency_rates').update(payload).eq('id', currency['id']);
                } else {
                  await _api.getSupabase().from('currency_rates').insert(payload);
                }
                Navigator.pop(ctx);
                _fetchData();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.emeraldAccent, foregroundColor: Colors.black),
              child: Text(isEdit ? "UPDATE RATE" : "ADD CURRENCY"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dialogInput(String label, TextEditingController controller, TextInputType type) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: type,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.white.withOpacity(0.05),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: const Color(0xFF020617),
        body: Column(
          children: [
            _buildHeader(),
            _buildTabs(),
            Expanded(
              child: _isLoading 
                ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                : TabBarView(
                    children: [
                      _buildExchangeTab(),
                      _buildPackagesTab(),
                      _buildCurrenciesTab(),
                    ],
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.cyan.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              FadeInLeft(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.cyan, Colors.blueAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.diamond, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Diamond & Currency", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Recharge packages & currency rates", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _fetchData,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("Refresh"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.cyan, Colors.blue]), borderRadius: BorderRadius.circular(8)),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white38,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        indicatorSize: TabBarIndicatorSize.tab,
        tabs: const [
          Tab(text: "Exchange Rate"),
          Tab(text: "Packages"),
          Tab(text: "Currencies"),
        ],
      ),
    );
  }

  Widget _buildExchangeTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildCard(
            title: "Beans to USD Exchange Rate",
            icon: LucideIcons.coins,
            color: Colors.amberAccent,
            description: "Set how many Beans equal \$1. This rate applies to all agencies.",
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("Beans Amount (per \$1 USD)", style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 12)),
                          const SizedBox(height: 8),
                          TextField(
                            controller: TextEditingController(text: _beansToUsdRate.toStringAsFixed(0)),
                            onChanged: (val) => _beansToUsdRate = double.tryParse(val) ?? 10000.0,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: Colors.white.withOpacity(0.05),
                              prefixIcon: const Icon(LucideIcons.coins, color: Colors.amberAccent),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 24),
                    ElevatedButton.icon(
                      onPressed: () async {
                        setState(() => _isSaving = true);
                        await _api.getSupabase().from('app_settings').upsert({
                          'key': 'beans_to_usd_rate',
                          'value': {'rate': _beansToUsdRate},
                          'updated_at': DateTime.now().toIso8601String(),
                        }, onConflict: 'key');
                        _fetchData();
                        setState(() => _isSaving = false);
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Exchange rate saved!")));
                      },
                      icon: _isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black)) : const Icon(LucideIcons.save, size: 16),
                      label: const Text("Save"),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.amberAccent, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24), shape: BorderRadius.circular(12)),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(LucideIcons.calculator, color: Colors.amberAccent, size: 16),
                          SizedBox(width: 12),
                          Text("Real-Time Calculation Preview", style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                        ],
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [10000, 50000, 100000, 500000].map((b) => Expanded(
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
                            child: Column(
                              children: [
                                Text("${b >= 1000 ? '${b ~/ 1000}K' : b} Beans", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                                const SizedBox(height: 4),
                                Text("\$${(b / _beansToUsdRate).toStringAsFixed(2)}", style: const TextStyle(color: Colors.amberAccent, fontSize: 16, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        )).toList(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPackagesTab() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 0.8),
      itemCount: _packages.length + 1,
      itemBuilder: (context, index) {
        if (index == _packages.length) {
          return _buildAddCard("NEW PACKAGE", LucideIcons.plus, Colors.cyan, () => _showPackageDialog());
        }
        final p = _packages[index];
        return _buildPackageCard(p);
      },
    );
  }

  Widget _buildCurrenciesTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(40, 20, 40, 0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              ElevatedButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Market rates fetched (Demo)"))),
                icon: const Icon(LucideIcons.refreshCw, size: 14),
                label: const Text("Fetch Live Rates"),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white),
              ),
              const SizedBox(width: 12),
              ElevatedButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Live rates saved!"))),
                icon: const Icon(LucideIcons.save, size: 14),
                label: const Text("Save Live Rates"),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.emerald.withOpacity(0.2), foregroundColor: Colors.emeraldAccent),
              ),
            ],
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(40),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.2),
            itemCount: _currencies.length + 1,
            itemBuilder: (context, index) {
              if (index == _currencies.length) {
                return _buildAddCard("NEW CURRENCY", LucideIcons.globe, Colors.emerald, () => _showCurrencyDialog());
              }
              final c = _currencies[index];
              return _buildCurrencyCard(c);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPackageCard(Map<String, dynamic> p) {
    final bool isSpecial = (p['is_popular'] ?? false);
    final int baseAmount = p['coins_amount'] ?? 0;
    final int bonusAmount = p['bonus_coins'] ?? 0;
    final int totalAmount = baseAmount + bonusAmount;

    return Container(
      decoration: BoxDecoration(
        color: isSpecial ? Colors.cyan.withOpacity(0.05) : Colors.white.withOpacity(0.01),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: isSpecial ? Colors.cyan.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.diamond, color: isSpecial ? Colors.cyanAccent : Colors.white24, size: 40),
          const SizedBox(height: 16),
          Text("$totalAmount", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
          if (bonusAmount > 0) Text("+$bonusAmount BONUS", style: const TextStyle(color: Colors.emeraldAccent, fontSize: 9, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text("\$${p['price_usd'] ?? 0}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _actionBtn(LucideIcons.edit2, Colors.white10, () => _showPackageDialog(p)),
              const SizedBox(width: 12),
              _actionBtn(LucideIcons.trash2, Colors.redAccent.withOpacity(0.1), () => _deletePackage(p['id'])),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCurrencyCard(Map<String, dynamic> c) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(c['country_code'] ?? '??', style: const TextStyle(color: Colors.emeraldAccent, fontWeight: FontWeight.w900, fontSize: 20)),
              Text(c['currency_symbol'] ?? '\$', style: const TextStyle(color: Colors.white24, fontSize: 18)),
            ],
          ),
          const Spacer(),
          Text("\$1 = ${c['rate_to_usd'] ?? 0} ${c['currency_code']}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 12),
          Row(
            children: [
              _actionBtn(LucideIcons.edit2, Colors.white10, () => _showCurrencyDialog(c)),
              const Spacer(),
              Switch(value: c['is_active'] ?? true, onChanged: (v) {
                _api.getSupabase().from('currency_rates').update({'is_active': v}).eq('id', c['id']).then((_) => _fetchData());
              }, activeColor: Colors.emeraldAccent),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCard({required String title, required IconData icon, required Color color, required String description, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(color: color.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: color.withOpacity(0.1))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 12),
              Text(title, style: GoogleFonts.outfit(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          Text(description, style: const TextStyle(color: Colors.white24, fontSize: 13)),
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }

  Widget _buildAddCard(String label, IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.2), style: BorderStyle.solid)),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 12),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _actionBtn(IconData icon, Color bg, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: Colors.white, size: 14)),
    );
  }
}

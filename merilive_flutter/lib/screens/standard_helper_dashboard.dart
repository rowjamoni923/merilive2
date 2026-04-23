import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';
import '../widgets/helper_accepted_methods_card.dart';
import '../screens/trader_tier_upgrade_screen.dart';

class StandardHelperDashboard extends StatefulWidget {
  const StandardHelperDashboard({super.key});

  @override
  State<StandardHelperDashboard> createState() => _StandardHelperDashboardState();
}

class _StandardHelperDashboardState extends State<StandardHelperDashboard> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic>? _helperInfo;
  int _currentLevel = 1;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final me = await _api.getMyProfile();
    final helper = await _api.getSupabase().from('topup_helpers').select().eq('user_id', me?['id']).maybeSingle();
    
    setState(() {
      _helperInfo = helper;
      _currentLevel = helper?['trader_level'] ?? 1;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildLevelCard(),
                _buildInventoryCard(),
                _buildWhatsAppCard(),
                _buildQuickActions(),
                if (_helperInfo != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                    child: HelperAcceptedMethodsCard(
                      helperId: _helperInfo!['user_id'],
                      countryCode: _helperInfo!['country_code'],
                    ),
                  ),
                Expanded(child: _buildRecentOrders()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Helper Dashboard", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              Text("Community Helper • Level $_currentLevel", style: GoogleFonts.outfit(color: Colors.amberAccent, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLevelCard() {
    int totalSold = _helperInfo?['total_sold_diamonds'] ?? 0;
    int target = _currentLevel * 50000;
    double progress = (totalSold / target).clamp(0.0, 1.0);

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Colors.amber.withOpacity(0.15), Colors.orange.withOpacity(0.15)]),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.amber.withOpacity(0.3)),
        boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.1), blurRadius: 20)],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Level Progress", style: GoogleFonts.outfit(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
              Text("${(progress * 100).toInt()}%", style: const TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(value: progress, backgroundColor: Colors.white10, color: Colors.amberAccent, minHeight: 10),
          ),
          const SizedBox(height: 12),
          Text("Sell ${(target - totalSold).clamp(0, target)} more diamonds to reach Level ${_currentLevel + 1}", style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildWhatsAppCard() {
    final wp = _helperInfo?['whatsapp_number'] ?? "";
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.green.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.green.withOpacity(0.2))),
      child: Row(
        children: [
          const Icon(LucideIcons.messageSquare, color: Colors.greenAccent, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Text(wp.isEmpty ? "Setup WhatsApp for Customers" : "WhatsApp: $wp", style: const TextStyle(color: Colors.white, fontSize: 13))),
          TextButton(
            onPressed: _showWhatsAppDialog,
            child: Text(wp.isEmpty ? "SETUP" : "EDIT", style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _showWhatsAppDialog() {
    final TextEditingController wpController = TextEditingController(text: _helperInfo?['whatsapp_number']);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text("WhatsApp Setup", style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: wpController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(hintText: "Enter number with country code"),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL")),
          TextButton(
            onPressed: () async {
              await _api.saveHelperWhatsapp(_helperInfo!['user_id'], wpController.text);
              Navigator.pop(context);
              _loadData();
            },
            child: const Text("SAVE", style: TextStyle(color: Colors.greenAccent)),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: _showBuyStockSheet,
              child: _actionBtn("Buy Stock", LucideIcons.shoppingCart, Colors.cyanAccent),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const TraderTierUpgradeScreen())),
              child: _actionBtn("Upgrade Level", LucideIcons.badgeCheck, Colors.purpleAccent),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              onTap: _showTransferSheet,
              child: _actionBtn("Transfer", LucideIcons.send, Colors.greenAccent),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInventoryCard() {
    final balance = _helperInfo?['diamond_balance'] ?? 0;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(LucideIcons.gem, color: Colors.cyanAccent, size: 24),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("TRADER INVENTORY", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
              Text(_api.formatNumber(balance), style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            ],
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text("STATUS", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
              Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: Colors.green.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                child: const Text("ACTIVE", style: TextStyle(color: Colors.greenAccent, fontSize: 9, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showBuyStockSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      isScrollControlled: true,
      builder: (context) => _BuyStockSheet(helperId: _helperInfo!['id'], currentLevel: _currentLevel),
    );
  }

  void _showTransferSheet() {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transfer module coming in next update!")));
  }

  Widget _actionBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildRecentOrders() {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.black.withOpacity(0.4), borderRadius: const BorderRadius.vertical(top: Radius.circular(30))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Community Orders", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              IconButton(icon: const Icon(LucideIcons.history, color: Colors.white54, size: 20), onPressed: () {}),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(LucideIcons.package2, color: Colors.white24, size: 48),
                  const SizedBox(height: 12),
                  const Text("No active orders found", style: TextStyle(color: Colors.white38)),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}

class _BuyStockSheet extends StatefulWidget {
  final String helperId;
  final int currentLevel;
  const _BuyStockSheet({required this.helperId, required this.currentLevel});

  @override
  State<_BuyStockSheet> createState() => _BuyStockSheetState();
}

class _BuyStockSheetState extends State<_BuyStockSheet> {
  final ApiService _api = ApiService();
  int? _selectedPackage;
  String _paymentMethod = "Binance";
  final TextEditingController _txIdController = TextEditingController();
  bool _isSubmitting = false;

  final List<int> _packages = [500000, 1000000, 2000000, 5000000];

  double _calculatePrice(int diamonds) {
    return (diamonds / 80000) * 17.5;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 24, right: 24, top: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Buy Diamond Stock", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text("Select a package to increase your trader inventory.", style: TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 24),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 1.8, crossAxisSpacing: 12, mainAxisSpacing: 12),
            itemCount: _packages.length,
            itemBuilder: (context, i) {
              final diamonds = _packages[i];
              final isSelected = _selectedPackage == diamonds;
              return GestureDetector(
                onTap: () => setState(() => _selectedPackage = diamonds),
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.cyanAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: isSelected ? Colors.cyanAccent : Colors.white10),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text("${(diamonds / 100000).toInt()} LAKH", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("\$${_calculatePrice(diamonds).toStringAsFixed(2)}", style: const TextStyle(color: Colors.cyanAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          const Text("PAYMENT METHOD", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
          const SizedBox(height: 12),
          _buildMethodTile("Binance (USDT)"),
          _buildMethodTile("ePay / Local Gateway"),
          const SizedBox(height: 24),
          TextField(
            controller: _txIdController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: "Transaction ID / Ref",
              hintStyle: const TextStyle(color: Colors.white24),
              filled: true,
              fillColor: Colors.black.withOpacity(0.2),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.cyanAccent,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text("SUBMIT REQUEST", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildMethodTile(String name) {
    bool isSelected = _paymentMethod == name;
    return GestureDetector(
      onTap: () => setState(() => _paymentMethod = name),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: isSelected ? Colors.white.withOpacity(0.1) : Colors.transparent, borderRadius: BorderRadius.circular(16), border: Border.all(color: isSelected ? Colors.white24 : Colors.white10)),
        child: Row(
          children: [
            Icon(isSelected ? LucideIcons.checkCircle2 : LucideIcons.circle, color: isSelected ? Colors.cyanAccent : Colors.white24, size: 18),
            const SizedBox(width: 12),
            Text(name, style: const TextStyle(color: Colors.white, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_selectedPackage == null || _txIdController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please select package and enter TxID")));
      return;
    }
    setState(() => _isSubmitting = true);
    final res = await _api.submitHelperTopupRequest(
      helperId: widget.helperId,
      amountUsd: _calculatePrice(_selectedPackage!),
      coinAmount: _selectedPackage!,
      paymentMethod: _paymentMethod,
      screenshotUrl: "https://merilive.com/placeholder_proof.png",
      transactionId: _txIdController.text,
    );
    setState(() => _isSubmitting = false);
    if (res['success'] == true) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Request submitted! Agent will review shortly."), backgroundColor: Colors.green));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: ${res['error']}")));
    }
  }
}

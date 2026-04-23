import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyCoinExchangeScreen extends StatefulWidget {
  const AgencyCoinExchangeScreen({super.key});

  @override
  State<AgencyCoinExchangeScreen> createState() => _AgencyCoinExchangeScreenState();
}

class _AgencyCoinExchangeScreenState extends State<AgencyCoinExchangeScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  final TextEditingController _beansController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _diamondsToSendController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSearching = false;
  bool _isProcessing = false;
  
  Map<String, dynamic>? _agency;
  int _personalBeans = 0;
  Map<String, dynamic> _settings = {
    'beans_to_diamonds_rate': 1,
    'exchange_fee_percent': 25,
    'min_exchange_amount': 100000,
  };
  
  List<Map<String, dynamic>> _searchResults = [];
  Map<String, dynamic>? _selectedTarget;
  List<Map<String, dynamic>> _transactions = [];
  String _sendType = 'user'; // 'user' or 'agency'

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
    _beansController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _beansController.dispose();
    _searchController.dispose();
    _diamondsToSendController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile == null) return;
      
      final agencyId = profile['agency_id'] ?? profile['id'];
      
      final results = await Future.wait([
        _api.getSupabase().from('agencies').select('*').eq('id', agencyId).maybeSingle(),
        _api.getSupabase().from('app_settings').select('setting_value').eq('setting_key', 'coin_exchange').maybeSingle(),
        _api.getAgencyDiamondTransactions(agencyId),
      ]);

      if (mounted) {
        setState(() {
          _agency = results[0];
          _personalBeans = profile['beans'] ?? 0;
          if (results[1]?['setting_value'] != null) {
            _settings = Map<String, dynamic>.from(results[1]['setting_value']);
          }
          _transactions = List<Map<String, dynamic>>.from(results[2]);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Load Error: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _searchTarget(String query) async {
    if (query.length < 3) return;
    setState(() => _isSearching = true);
    try {
      if (_sendType == 'user') {
        final res = await _api.getSupabase()
            .from('profiles')
            .select('id, display_name, avatar_url, app_uid')
            .or('app_uid.eq.$query,username.ilike.%$query%')
            .limit(5);
        setState(() => _searchResults = List<Map<String, dynamic>>.from(res));
      } else {
        // Search Agency by owner's App UID or Agency Code
        final res = await _api.getSupabase()
            .from('agencies')
            .select('*, owner:profiles(display_name, avatar_url, app_uid)')
            .or('agency_code.eq.$query');
        setState(() => _searchResults = List<Map<String, dynamic>>.from(res));
      }
    } catch (e) {
      debugPrint("Search Error: $e");
    } finally {
      setState(() => _isSearching = false);
    }
  }

  Future<void> _handleExchange() async {
    final beans = int.tryParse(_beansController.text) ?? 0;
    final min = _settings['min_exchange_amount'] ?? 100000;
    
    if (beans < min) {
      _showError("Minimum exchange is ${NumberFormat('#,###').format(min)} Beans");
      return;
    }
    if (beans > _personalBeans) {
      _showError("Insufficient Personal Beans balance");
      return;
    }

    setState(() => _isProcessing = true);
    try {
      final rate = _settings['beans_to_diamonds_rate'] ?? 1;
      final feePercent = _settings['exchange_fee_percent'] ?? 25;
      final rawDiamonds = beans ~/ rate;
      final fee = (rawDiamonds * feePercent / 100).floor();
      final netDiamonds = rawDiamonds - fee;

      final res = await _api.getSupabase().rpc('exchange_user_beans_to_diamonds', params: {
        '_user_id': _api.currentUserId,
        '_beans_amount': beans,
        '_diamonds_reward': netDiamonds,
        '_tier_id': null,
      });

      if (res['success'] == true) {
        _showSuccess("Exchange Successful!");
        _beansController.clear();
        _loadData();
      } else {
        _showError(res['error'] ?? "Exchange failed");
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _handleSend() async {
    if (_selectedTarget == null) return;
    final amount = int.tryParse(_diamondsToSendController.text) ?? 0;
    if (amount <= 0) return;
    if (amount > (_agency?['diamond_balance'] ?? 0)) {
      _showError("Insufficient Agency Diamonds");
      return;
    }

    setState(() => _isProcessing = true);
    try {
      Map<String, dynamic> res;
      if (_sendType == 'user') {
        res = await _api.agencySendDiamondsToUser(
          agencyId: _agency!['id'],
          receiverId: _selectedTarget!['id'],
          amount: amount,
        );
      } else {
        res = await _api.agencySendDiamondsToAgency(
          senderAgencyId: _agency!['id'],
          targetAgencyId: _selectedTarget!['id'],
          amount: amount,
        );
      }

      if (res['success'] == true) {
        _showSuccess("Diamonds Sent!");
        _diamondsToSendController.clear();
        _selectedTarget = null;
        _searchController.clear();
        _loadData();
      } else {
        _showError(res['error'] ?? "Transfer failed");
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.redAccent));
  }

  void _showSuccess(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.greenAccent));
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.amber)));

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildTabBar(),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildExchangeTab(),
                      _buildSendTab(),
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

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 8),
          Text("DIAMOND HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
            child: const Icon(LucideIcons.history, color: Colors.white70, size: 20),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      height: 50,
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]), borderRadius: BorderRadius.circular(14)),
        labelStyle: const TextStyle(fontWeight: FontWeight.bold),
        unselectedLabelColor: Colors.white38,
        tabs: const [Tab(text: "EXCHANGE"), Tab(text: "SEND")],
      ),
    );
  }

  Widget _buildExchangeTab() {
    final beans = int.tryParse(_beansController.text) ?? 0;
    final rate = _settings['beans_to_diamonds_rate'] ?? 1;
    final feePercent = _settings['exchange_fee_percent'] ?? 25;
    final rawDiamonds = beans ~/ rate;
    final fee = (rawDiamonds * feePercent / 100).floor();
    final netDiamonds = rawDiamonds - fee;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          _buildBalanceGrid(),
          const SizedBox(height: 32),
          _buildExchangeInputs(netDiamonds, fee),
          const SizedBox(height: 40),
          _buildActionButton("CONFIRM EXCHANGE", _handleExchange, Colors.amber),
          const SizedBox(height: 40),
          _buildTransactionHistory(),
        ],
      ),
    );
  }

  Widget _buildSendTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          _buildDiamondBalanceCard(),
          const SizedBox(height: 32),
          _buildSendInputs(),
          const SizedBox(height: 32),
          if (_selectedTarget != null) ...[
            _buildSelectedTargetCard(),
            const SizedBox(height: 24),
            _buildActionButton("SEND DIAMONDS", _handleSend, Colors.blueAccent),
          ],
        ],
      ),
    );
  }

  Widget _buildBalanceGrid() {
    return Row(
      children: [
        Expanded(child: _buildStatCard("My Beans", _personalBeans, LucideIcons.coins, Colors.amber)),
        const SizedBox(width: 16),
        Expanded(child: _buildStatCard("Agency Diamonds", _agency?['diamond_balance'] ?? 0, LucideIcons.gem, Colors.blueAccent)),
      ],
    );
  }

  Widget _buildStatCard(String label, int val, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.2))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 12),
          Text(NumberFormat('#,###').format(val), style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildDiamondBalanceCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF2563EB)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.blue.withOpacity(0.3), blurRadius: 20)],
      ),
      child: Column(
        children: [
          const Text("AGENCY DIAMOND BALANCE", style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(NumberFormat('#,###').format(_agency?['diamond_balance'] ?? 0), style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              const Icon(LucideIcons.gem, color: Colors.white, size: 28),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildExchangeInputs(int net, int fee) {
    return Column(
      children: [
        _buildInputField(_beansController, "CONVERT FROM (BEANS)", LucideIcons.coins, suffix: "MAX", onSuffix: () => _beansController.text = _personalBeans.toString()),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24)),
          child: Column(
            children: [
              _buildValueRow("Diamonds Recieve", "+ ${NumberFormat('#,###').format(net)}", Colors.greenAccent),
              const SizedBox(height: 8),
              _buildValueRow("Processing Fee (${_settings['exchange_fee_percent']}% )", "- ${NumberFormat('#,###').format(fee)}", Colors.redAccent),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSendInputs() {
    return Column(
      children: [
        Row(
          children: [
            _buildTypeBtn("TO USER", _sendType == 'user', () => setState(() { _sendType = 'user'; _selectedTarget = null; })),
            const SizedBox(width: 12),
            _buildTypeBtn("TO AGENCY", _sendType == 'agency', () => setState(() { _sendType = 'agency'; _selectedTarget = null; })),
          ],
        ),
        const SizedBox(height: 20),
        _buildSearchField(),
        if (_searchResults.isNotEmpty && _selectedTarget == null) _buildSearchResultsList(),
        const SizedBox(height: 20),
        _buildInputField(_diamondsToSendController, "AMOUNT TO SEND", LucideIcons.send),
      ],
    );
  }

  Widget _buildTypeBtn(String label, bool isSel, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: isSel ? Colors.blueAccent : Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: Text(label, style: TextStyle(color: isSel ? Colors.white : Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }

  Widget _buildSearchField() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: TextField(
        controller: _searchController,
        onChanged: _searchTarget,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          icon: _isSearching ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white24)) : const Icon(LucideIcons.search, color: Colors.white24, size: 20),
          hintText: _sendType == 'user' ? "Search by UID..." : "Enter Agency Code...",
          hintStyle: const TextStyle(color: Colors.white10),
          border: InputBorder.none,
        ),
      ),
    );
  }

  Widget _buildSearchResultsList() {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: Column(
        children: _searchResults.map((item) {
          final isAgency = _sendType == 'agency';
          final name = isAgency ? item['name'] : (item['display_name'] ?? 'Unknown');
          final uid = isAgency ? item['agency_code'] : (item['app_uid'] ?? 'N/A');
          final avatar = isAgency ? (item['owner']?['avatar_url']) : item['avatar_url'];

          return ListTile(
            onTap: () => setState(() { _selectedTarget = item; _searchResults = []; _searchController.text = uid; }),
            leading: CircleAvatar(backgroundImage: avatar != null ? NetworkImage(avatar) : null, backgroundColor: Colors.white10),
            title: Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            subtitle: Text(isAgency ? "Code: $uid" : "UID: $uid", style: const TextStyle(color: Colors.white38, fontSize: 11)),
            trailing: const Icon(LucideIcons.plus, color: Colors.blueAccent, size: 16),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSelectedTargetCard() {
    final isAgency = _sendType == 'agency';
    final name = isAgency ? _selectedTarget!['name'] : (_selectedTarget!['display_name'] ?? 'Unknown');
    final avatar = isAgency ? (_selectedTarget!['owner']?['avatar_url']) : _selectedTarget!['avatar_url'];

    return FadeIn(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.blueAccent.withOpacity(0.3))),
        child: Row(
          children: [
            CircleAvatar(radius: 24, backgroundImage: avatar != null ? NetworkImage(avatar) : null),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("RECIPIENT", style: TextStyle(color: Colors.blueAccent, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                  Text(name, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            IconButton(icon: const Icon(LucideIcons.x, color: Colors.white24, size: 18), onPressed: () => setState(() => _selectedTarget = null)),
          ],
        ),
      ),
    );
  }

  Widget _buildInputField(TextEditingController controller, String label, IconData icon, {String? suffix, VoidCallback? onSuffix}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              icon: Icon(icon, color: Colors.white24),
              border: InputBorder.none,
              hintText: "0",
              hintStyle: const TextStyle(color: Colors.white10),
              suffix: suffix != null ? TextButton(onPressed: onSuffix, child: Text(suffix, style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold))) : null,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildValueRow(String label, String val, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 12)),
        Text(val, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }

  Widget _buildActionButton(String label, VoidCallback onTap, Color color) {
    return SizedBox(
      width: double.infinity,
      height: 60,
      child: ElevatedButton(
        onPressed: _isProcessing ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          elevation: 0,
        ),
        child: _isProcessing 
          ? const CircularProgressIndicator(color: Colors.white) 
          : Text(label, style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1)),
      ),
    );
  }

  Widget _buildTransactionHistory() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text("RECENT TRANSACTIONS", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
        const SizedBox(height: 16),
        if (_transactions.isEmpty)
          const Center(child: Text("No transactions yet", style: TextStyle(color: Colors.white12, fontSize: 12)))
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _transactions.length,
            itemBuilder: (context, index) {
              final tx = _transactions[index];
              final type = tx['transaction_type'];
              final amount = tx['diamond_amount'];
              final date = DateFormat('MMM dd, HH:mm').format(DateTime.parse(tx['created_at']));
              final profile = tx['profiles'];

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20)),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: (type == 'exchange' ? Colors.amber : Colors.blue).withOpacity(0.1), shape: BoxShape.circle),
                      child: Icon(type == 'exchange' ? LucideIcons.refreshCw : LucideIcons.send, color: type == 'exchange' ? Colors.amber : Colors.blue, size: 16),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(type == 'exchange' ? "Beans Exchange" : "Sent Diamonds", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                          Text(profile != null ? "To: ${profile['display_name']}" : date, style: const TextStyle(color: Colors.white38, fontSize: 11)),
                        ],
                      ),
                    ),
                    Text("+${NumberFormat('#,###').format(amount)}", style: GoogleFonts.outfit(color: Colors.greenAccent, fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }
}



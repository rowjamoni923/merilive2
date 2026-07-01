import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'dart:ui';
import '../widgets/dynamic_avatar.dart';
import '../services/api_service.dart';

class AgencyCoinTraderScreen extends StatefulWidget {
  const AgencyCoinTraderScreen({super.key});

  @override
  State<AgencyCoinTraderScreen> createState() => _AgencyCoinTraderScreenState();
}

class _AgencyCoinTraderScreenState extends State<AgencyCoinTraderScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSearching = false;
  bool _isProcessing = false;
  
  Map<String, dynamic>? _traderData;
  Map<String, dynamic>? _foundRecipient;
  List<Map<String, dynamic>> _history = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      setState(() {
        _foundRecipient = null;
        _searchController.clear();
      });
    });
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);
    final api = Provider.of<ApiService>(context, listen: false);
    final userId = api.currentUser?.id ?? '';
    
    final stock = await api.getTraderStockBalance(userId);
    // Note: We need the internal helper ID for transfers, usually matches user_id or provided in helper data
    // For now using user_id as proxy or assuming same if simplified
    final history = await api.getTraderTransferHistory(userId); 
    
    if (mounted) {
      setState(() {
        _traderData = stock;
        _history = history;
        _isLoading = false;
      });
    }
  }

  Future<void> _searchRecipient() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    setState(() => _isSearching = true);
    final api = Provider.of<ApiService>(context, listen: false);
    
    dynamic result;
    if (_tabController.index == 0) {
      // User Mode: Search by UID
      result = await api.getUserProfileByUid(query);
    } else if (_tabController.index == 1) {
      // Agency Mode: Search by Code
      result = await api.searchAgencyByCode(query);
    } else {
      // Self Mode: No search needed, recipient is self
      result = {'is_self': true};
    }

    if (mounted) {
      setState(() {
        _foundRecipient = result;
        _isSearching = false;
      });
    }
  }

  Future<void> _executeTransfer() async {
    final amount = int.tryParse(_amountController.text) ?? 0;
    if (amount <= 0 || _traderData == null) return;
    
    final currentBalance = (_traderData!['wallet_balance'] ?? 0).toInt();
    if (amount > currentBalance) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Insufficient stock balance!")));
      return;
    }

    setState(() => _isProcessing = true);
    final api = Provider.of<ApiService>(context, listen: false);
    
    String recipientId = '';
    String type = '';
    
    if (_tabController.index == 0) {
      recipientId = _foundRecipient?['id'] ?? '';
      type = 'user';
    } else if (_tabController.index == 1) {
      recipientId = _foundRecipient?['id'] ?? '';
      type = 'agency';
    } else {
      recipientId = api.currentUser?.id ?? '';
      type = 'self';
    }

    final success = await api.traderTransfer(
      helperId: api.currentUser?.id ?? '',
      recipientId: recipientId,
      recipientType: type,
      amount: amount,
    );

    if (mounted) {
      setState(() => _isProcessing = false);
      if (success) {
        _loadAllData();
        _amountController.clear();
        _foundRecipient = null;
        _searchController.clear();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Diamonds transferred successfully!"), backgroundColor: Colors.green));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transfer failed. Please try again."), backgroundColor: Colors.red));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Color(0xFF10B981))));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          Positioned(top: -50, right: -50, child: _blurGlow(const Color(0x2210B981), 300)),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadAllData,
                    color: const Color(0xFF10B981),
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 16),
                          _buildStockCard(),
                          const SizedBox(height: 24),
                          _buildModeTabs(),
                          const SizedBox(height: 24),
                          if (_tabController.index != 2) _buildRecipientSearch(),
                          if (_foundRecipient != null || _tabController.index == 2) ...[
                             const SizedBox(height: 20),
                             _buildRecipientPreview(),
                             const SizedBox(height: 24),
                             _buildAmountInput(),
                             const SizedBox(height: 32),
                             _buildTransferButton(),
                          ],
                          const SizedBox(height: 48),
                          _buildHistoryHeader(),
                          const SizedBox(height: 16),
                          _buildHistoryList(),
                          const SizedBox(height: 40),
                        ],
                      ),
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
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("TRADER HUB", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
              Text("Stock Management & Top-up", style: GoogleFonts.inter(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStockCard() {
    final balance = _traderData?['wallet_balance'] ?? 0;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF065F46), Color(0xFF0F172A)]),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
        boxShadow: [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.1), blurRadius: 20)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("MY STOCK BALANCE", style: GoogleFonts.inter(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1)),
              const Icon(LucideIcons.shieldCheck, color: Color(0xFF10B981), size: 16),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(LucideIcons.coins, color: Colors.amber, size: 32),
              const SizedBox(width: 12),
              Text(NumberFormat('#,###').format(balance), style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildModeTabs() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF10B981).withOpacity(0.2), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3))),
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.bold),
        unselectedLabelStyle: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.bold),
        tabs: const [Tab(text: "TO USER"), Tab(text: "TO AGENCY"), Tab(text: "SELF")],
      ),
    );
  }

  Widget _buildRecipientSearch() {
    String hint = _tabController.index == 0 ? "Enter User UID" : "Enter Agency Code";
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          const Icon(LucideIcons.search, color: Colors.white38, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: _searchController,
              style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(hintText: hint, hintStyle: GoogleFonts.inter(color: Colors.white24), border: InputBorder.none),
              onSubmitted: (_) => _searchRecipient(),
            ),
          ),
          if (_isSearching) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF10B981))),
          IconButton(icon: const Icon(LucideIcons.arrowRight, color: Color(0xFF10B981)), onPressed: _searchRecipient),
        ],
      ),
    );
  }

  Widget _buildRecipientPreview() {
    if (_tabController.index == 2) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.blue.withOpacity(0.2))),
        child: Row(
          children: [
            const Icon(LucideIcons.user, color: Colors.blue, size: 32),
            const SizedBox(width: 16),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text("SELF RECHARGE", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold)), Text("Top up your personal wallet", style: GoogleFonts.inter(color: Colors.white38, fontSize: 10))]),
          ],
        ),
      );
    }

    bool isAgency = _tabController.index == 1;
    String name = isAgency ? (_foundRecipient!['name'] ?? 'Agency') : (_foundRecipient!['display_name'] ?? 'User');
    String identifier = isAgency ? "Code: ${_foundRecipient!['agency_code']}" : "UID: ${_foundRecipient!['app_uid']}";
    String? avatar = isAgency ? (_foundRecipient!['profiles']?['avatar_url']) : _foundRecipient!['avatar_url'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: const Color(0xFF10B981).withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3))),
      child: Row(
        children: [
          DynamicAvatar(level: 1, avatarUrl: avatar, size: 50, showFrame: false),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                Text(identifier, style: GoogleFonts.inter(color: Colors.white54, fontSize: 12)),
              ],
            ),
          ),
          if (!isAgency) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.blue.withOpacity(0.2), borderRadius: BorderRadius.circular(8)), child: Text("Lv.${_foundRecipient!['level'] ?? 0}", style: GoogleFonts.inter(color: Colors.blue, fontSize: 10, fontWeight: FontWeight.bold))),
        ],
      ),
    );
  }

  Widget _buildAmountInput() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("TRANSFER AMOUNT", style: GoogleFonts.inter(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
          child: Row(
            children: [
              const Icon(LucideIcons.coins, color: Colors.amber, size: 24),
              const SizedBox(width: 16),
              Expanded(
                child: TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900),
                  decoration: InputDecoration(hintText: "0", hintStyle: GoogleFonts.outfit(color: Colors.white24), border: InputBorder.none),
                ),
              ),
              Text("DIAMONDS", style: GoogleFonts.inter(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTransferButton() {
    return GestureDetector(
      onTap: _isProcessing ? null : _executeTransfer,
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]),
          borderRadius: BorderRadius.circular(32),
          boxShadow: [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 10))],
        ),
        child: Center(
          child: _isProcessing 
            ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
            : Text("CONFIRM TRANSFER", style: GoogleFonts.inter(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 2)),
        ),
      ),
    );
  }

  Widget _buildHistoryHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text("RECENT TRADES", style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        TextButton(onPressed: _loadAllData, child: Text("Refresh", style: GoogleFonts.inter(color: const Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.bold))),
      ],
    );
  }

  Widget _buildHistoryList() {
    if (_history.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24)),
        child: Center(child: Column(children: [const Icon(LucideIcons.history, color: Colors.white10, size: 48), const SizedBox(height: 16), Text("No history available", style: GoogleFonts.inter(color: Colors.white24, fontSize: 12))])),
      );
    }

    return Column(
      children: _history.map((item) => _historyItem(item)).toList(),
    );
  }

  Widget _historyItem(Map<String, dynamic> item) {
    final bool isUser = item['transaction_type'] == 'sell_to_user';
    final recipient = item['recipient'];
    final name = recipient?['display_name'] ?? 'Unknown';
    final amount = item['coin_amount'] ?? 0;
    final date = DateTime.parse(item['created_at']);
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          _avatarIcon(recipient?['avatar_url'], isUser),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: GoogleFonts.inter(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                Text(DateFormat('MMM dd, HH:mm').format(date.toLocal()), style: GoogleFonts.inter(color: Colors.white38, fontSize: 10)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("-${NumberFormat.compact().format(amount)}", style: GoogleFonts.outfit(color: Colors.orangeAccent, fontSize: 16, fontWeight: FontWeight.w900)),
              Text("Diamonds", style: GoogleFonts.inter(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _avatarIcon(String? url, bool isUser) {
    if (url != null) return DynamicAvatar(level: 1, avatarUrl: url, size: 40, showFrame: false);
    return Container(
      width: 40, height: 40,
      decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(12)),
      child: Center(child: Icon(isUser ? LucideIcons.user : LucideIcons.building2, color: Colors.white24, size: 20)),
    );
  }

  Widget _blurGlow(Color color, double size) => Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: color, boxShadow: [BoxShadow(color: color, blurRadius: 100)]));
}



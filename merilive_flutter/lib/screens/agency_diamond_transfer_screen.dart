import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyDiamondTransferScreen extends StatefulWidget {
  final Map<String, dynamic> traderData;
  final String? initialMode; // 'user', 'agency', 'self'

  const AgencyDiamondTransferScreen({
    super.key, 
    required this.traderData,
    this.initialMode,
  });

  @override
  State<AgencyDiamondTransferScreen> createState() => _AgencyDiamondTransferScreenState();
}

class _AgencyDiamondTransferScreenState extends State<AgencyDiamondTransferScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  late TabController _tabController;
  
  bool _isSearching = false;
  bool _isProcessing = false;
  Map<String, dynamic>? _targetEntity;
  late String _mode;

  @override
  void initState() {
    super.initState();
    
    // Map initialMode to index
    int initialIndex = 0;
    if (widget.initialMode == 'agency') initialIndex = 1;
    if (widget.initialMode == 'self') initialIndex = 2;

    _mode = widget.initialMode ?? 'user';
    _tabController = TabController(length: 3, vsync: this, initialIndex: initialIndex);
    _tabController.addListener(() {
      setState(() {
        _mode = ['user', 'agency', 'self'][_tabController.index];
        _targetEntity = null;
        _searchController.clear();
      });
    });
  }

  Future<void> _handleSearch() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    setState(() => _isSearching = true);
    try {
      if (_mode == 'user') {
        _targetEntity = await _api.searchUserByAppUid(query);
      } else if (_mode == 'agency') {
        _targetEntity = await _api.searchAgencyByCode(query);
      }
    } catch (e) {
      debugPrint(e.toString());
    } finally {
      if (mounted) setState(() => _isSearching = false);
    }
  }

  Future<void> _handleTransfer() async {
    if (_targetEntity == null && _mode != 'self') return;
    final amount = int.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) return;

    setState(() => _isProcessing = true);
    try {
      final res = await _api.performDiamondTransfer({
        '_mode': _mode,
        '_target_id': _mode == 'self' ? widget.traderData['user_id'] : _targetEntity?['id'],
        '_diamond_amount': amount,
        '_sender_helper_id': widget.traderData['id']
      });

      if (res['success']) {
        _showSuccess();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message'] ?? "Transfer Failed")));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _showSuccess() {
    showDialog(
      context: context,
      builder: (context) => FadeInUp(
        child: AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          title: const Text("Success! 💎", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          content: Text("Transfer of ${_amountController.text} Diamonds completed."),
          actions: [
            TextButton(onPressed: () { Navigator.pop(context); Navigator.pop(context); }, child: const Text("OK", style: TextStyle(color: Colors.cyanAccent)))
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            _buildModeTabs(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    if (_mode != 'self') _buildSearchSection(),
                    if (_targetEntity != null || _mode == 'self') _buildTransferDetails(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 12),
          Text("Diamond Transfer", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildModeTabs() {
    return TabBar(
      controller: _tabController,
      indicatorColor: const Color(0xFF8B5CF6),
      indicatorWeight: 4,
      labelColor: Colors.white,
      unselectedLabelColor: Colors.white24,
      labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 13),
      tabs: const [
        Tab(text: "To User"),
        Tab(text: "To Agency"),
        Tab(text: "My Topup"),
      ],
    );
  }

  Widget _buildSearchSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(_mode == 'user' ? "SEARCH APP UID" : "SEARCH AGENCY CODE", style: const TextStyle(color: Colors.white38, fontSize: 10, letterSpacing: 2)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(border: InputBorder.none, hintText: _mode == 'user' ? "e.g. ML123456" : "e.g. AR123"),
                ),
              ),
            ),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: _isSearching ? null : _handleSearch,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.cyanAccent, borderRadius: BorderRadius.circular(16)),
                child: _isSearching ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black)) : const Icon(LucideIcons.search, color: Colors.black),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (_targetEntity != null) FadeInDown(child: _buildEntityCard()),
      ],
    );
  }

  Widget _buildEntityCard() {
    final title = _mode == 'user' ? _targetEntity!['display_name'] : _targetEntity!['name'];
    final subtitle = _mode == 'user' ? "UID: ${_targetEntity!['app_uid']}" : "Code: ${_targetEntity!['agency_code']}";
    final avatar = _mode == 'user' ? _targetEntity!['avatar_url'] : _targetEntity!['logo_url'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.cyanAccent.withOpacity(0.3))),
      child: Row(
        children: [
          CircleAvatar(backgroundImage: NetworkImage(avatar ?? ''), radius: 24),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 11))])),
          const Icon(LucideIcons.checkCircle2, color: Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _buildTransferDetails() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 40),
        Text("TRANSFER AMOUNT (💎)", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2)),
        const SizedBox(height: 12),
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 44, fontWeight: FontWeight.w900),
          decoration: const InputDecoration(border: InputBorder.none, hintText: "0", hintStyle: TextStyle(color: Colors.white10)),
        ),
        const SizedBox(height: 48),
        SizedBox(
          width: double.infinity,
          child: Container(
            height: 60,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFF6366F1)]),
              borderRadius: BorderRadius.circular(20),
            ),
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent, 
                shadowColor: Colors.transparent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))
              ),
              onPressed: _isProcessing ? null : _handleTransfer,
              child: _isProcessing 
                ? const CircularProgressIndicator(color: Colors.white) 
                : Text("CONFIRM TRANSFER", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
            ),
          ),
        ),
      ],
    );
  }
}



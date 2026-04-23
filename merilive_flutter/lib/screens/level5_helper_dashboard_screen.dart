import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';
import '../widgets/premium_avatar.dart';
import '../widgets/nebula_background.dart';

class Level5HelperDashboardScreen extends StatefulWidget {
  const Level5HelperDashboardScreen({super.key});

  @override
  State<Level5HelperDashboardScreen> createState() => _Level5HelperDashboardScreenState();
}

class _Level5HelperDashboardScreenState extends State<Level5HelperDashboardScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  final _supabase = Supabase.instance.client;
  late TabController _tabController;
  
  bool _isLoading = true;
  Map<String, dynamic>? _helperData;
  List<Map<String, dynamic>> _withdrawalQueue = [];
  List<Map<String, dynamic>> _adminMessages = [];
  List<Map<String, dynamic>> _history = [];
  
  int _activeTab = 0;
  Timer? _lockTimer;
  int _lockSecondsRemaining = 0;
  String? _currentlyClaimedId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      setState(() => _activeTab = _tabController.index);
    });
    _loadData();
    _setupRealtime();
  }

  @override
  void dispose() {
    _lockTimer?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final helper = await _supabase.from('topup_helpers').select('*').eq('user_id', user.id).maybeSingle();
      
      if (helper != null) {
        final results = await Future.wait([
          _api.getAgencyWithdrawalsQueue(helper['country_code'] ?? 'BD'),
          _api.getHelperAdminMessages(),
          _supabase.from('agency_withdrawals').select('*, agency:agencies(name)').eq('processed_by', helper['id']).order('processed_at', ascending: false).limit(20),
        ]);

        if (mounted) {
          setState(() {
            _helperData = helper;
            _withdrawalQueue = results[0] as List<Map<String, dynamic>>;
            _adminMessages = results[1] as List<Map<String, dynamic>>;
            _history = List<Map<String, dynamic>>.from(results[2] as List);
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtime() {
    _supabase.channel('helper_nexus_sync')
      .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'agency_withdrawals', callback: (p) => _loadData())
      .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'helper_admin_messages', callback: (p) => _loadData())
      .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          if (_isLoading)
            const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
          else if (_helperData == null)
            _buildAccessDenied()
          else
            SafeArea(
              child: Column(
                children: [
                  _buildPremiumHeader(),
                  _buildTabBar(),
                  Expanded(
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        _buildWithdrawalQueueView(),
                        _buildAdminInboxView(),
                        _buildHistoryView(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          if (_lockSecondsRemaining > 0) _buildLockOverlay(),
        ],
      ),
    );
  }

  Widget _buildPremiumHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.chevronLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("PAYROLL NEXUS", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20, letterSpacing: 1)),
              Text("Level 5 Certified • Master Parity", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10)),
            ],
          ),
          const Spacer(),
          _buildWalletChip(),
        ],
      ),
    );
  }

  Widget _buildWalletChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.wallet, color: Colors.cyanAccent, size: 16),
          const SizedBox(width: 10),
          Text(NumberFormat('#,###').format(_helperData?['wallet_balance'] ?? 0), style: GoogleFonts.spaceMono(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.cyanAccent.withOpacity(0.2))),
        labelColor: Colors.cyanAccent,
        unselectedLabelColor: Colors.white24,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 12),
        tabs: const [
          Tab(text: "QUEUE"),
          Tab(text: "MESSAGES"),
          Tab(text: "HISTORY"),
        ],
      ),
    );
  }

  Widget _buildWithdrawalQueueView() {
    if (_withdrawalQueue.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.file(File("C:/Users/RJ BOSS/.gemini/antigravity/brain/2280ae0a-c1ac-4917-b499-66ee59c8e583/3d_helper_withdraw_icon_1776892363455.png"), width: 120),
            const SizedBox(height: 24),
            Text("Queue is empty", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 16)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24),
      itemCount: _withdrawalQueue.length,
      itemBuilder: (context, index) => _buildWithdrawalCard(_withdrawalQueue[index], index),
    );
  }

  Widget _buildWithdrawalCard(Map<String, dynamic> withdrawal, int index) {
    final bool isClaimed = withdrawal['status'] == 'processing';
    final bool isByMe = withdrawal['claimed_by'] == _supabase.auth.currentUser?.id;
    final agency = withdrawal['agency'] ?? {};

    return FadeInLeft(
      delay: Duration(milliseconds: index * 50),
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isByMe ? Colors.cyanAccent.withOpacity(0.05) : Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: isByMe ? Colors.cyanAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                PremiumAvatar(imageUrl: agency['owner']?['avatar_url'] ?? '', size: 48),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(agency['name'] ?? 'Unknown Agency', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      Text("Code: ${agency['agency_code']}", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 11)),
                    ],
                  ),
                ),
                if (isClaimed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text(isByMe ? "CLAIMED" : "LOCKED", style: GoogleFonts.outfit(color: Colors.amberAccent, fontWeight: FontWeight.w900, fontSize: 9, letterSpacing: 1)),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(24)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("SETTLEMENT AMOUNT", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 9, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Text("${withdrawal['amount_beans']} BEANS", style: GoogleFonts.spaceMono(color: Colors.greenAccent, fontWeight: FontWeight.w900, fontSize: 18)),
                      Text("≈ \$${withdrawal['amount_usd']}", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
                    ],
                  ),
                  _buildPaymentMethodBadge(withdrawal['payment_method']),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (!isClaimed)
              _buildPrimaryBtn("CLAIM REQUEST", Colors.cyanAccent, () => _handleClaim(withdrawal['id']))
            else if (isByMe)
              Row(
                children: [
                  Expanded(child: _buildSecondaryBtn("RELEASE", Colors.redAccent, () => _handleRelease(withdrawal['id']))),
                  const SizedBox(width: 16),
                  Expanded(child: _buildPrimaryBtn("SETTLE", Colors.greenAccent, () => _showSettlementDialog(withdrawal))),
                ],
              )
            else
              _buildPrimaryBtn("LOCKED BY ANOTHER", Colors.white.withOpacity(0.1), null),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentMethodBadge(String method) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
      child: Text(method.toUpperCase(), style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildAdminInboxView() {
    if (_adminMessages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.file(File("C:/Users/RJ BOSS/.gemini/antigravity/brain/2280ae0a-c1ac-4917-b499-66ee59c8e583/3d_helper_messages_icon_1776892378342.png"), width: 120),
            const SizedBox(height: 24),
            Text("No admin messages", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 16)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24),
      itemCount: _adminMessages.length,
      itemBuilder: (context, index) => _buildMessageCard(_adminMessages[index], index),
    );
  }

  Widget _buildMessageCard(Map<String, dynamic> msg, int index) {
    final admin = msg['admin'] ?? {};
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              PremiumAvatar(imageUrl: admin['avatar_url'] ?? '', size: 36),
              const SizedBox(width: 12),
              Text(admin['display_name'] ?? 'Admin', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              const Spacer(),
              Text(DateFormat('MMM dd, HH:mm').format(DateTime.parse(msg['created_at'])), style: TextStyle(color: Colors.white24, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 16),
          Text(msg['message'] ?? '', style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.5)),
          if (msg['helper_reply'] != null) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("YOUR REPLY", style: GoogleFonts.outfit(color: Colors.cyanAccent, fontSize: 9, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text(msg['helper_reply'], style: const TextStyle(color: Colors.white, fontSize: 12)),
                ],
              ),
            ),
          ] else
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: _buildSecondaryBtn("REPLY", Colors.cyanAccent, () => _showReplyDialog(msg['id'])),
            ),
        ],
      ),
    );
  }

  Widget _buildHistoryView() {
    return ListView.builder(
      padding: const EdgeInsets.all(24),
      itemCount: _history.length,
      itemBuilder: (context, index) {
        final item = _history[index];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(LucideIcons.check, color: Colors.greenAccent, size: 18),
          ),
          title: Text(item['agency']?['name'] ?? 'Agency Settlement', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          subtitle: Text(DateFormat('MMM dd, yyyy • HH:mm').format(DateTime.parse(item['processed_at'] ?? item['created_at'])), style: TextStyle(color: Colors.white24, fontSize: 11)),
          trailing: Text("+ \$${item['amount_usd']}", style: GoogleFonts.spaceMono(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 14)),
        );
      },
    );
  }

  Widget _buildLockOverlay() {
    return Positioned(
      top: 100, left: 24, right: 24,
      child: FadeInDown(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: BoxDecoration(color: Colors.amberAccent, borderRadius: BorderRadius.circular(100), boxShadow: [BoxShadow(color: Colors.amberAccent.withOpacity(0.3), blurRadius: 20)]),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.clock, color: Colors.black, size: 18),
              const SizedBox(width: 12),
              Text("LOCK ACTIVE: $_lockSecondsRemaining SECONDS REMAINING", style: GoogleFonts.outfit(color: Colors.black, fontWeight: FontWeight.w900, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPrimaryBtn(String label, Color color, VoidCallback? onTap) {
    return SizedBox(
      width: double.infinity, height: 56,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: color == Colors.cyanAccent ? Colors.black : Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        ),
        child: Text(label, style: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 1)),
      ),
    );
  }

  Widget _buildSecondaryBtn(String label, Color color, VoidCallback onTap) {
    return SizedBox(
      height: 56,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: color.withOpacity(0.3)),
          foregroundColor: color,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        ),
        child: Text(label, style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13)),
      ),
    );
  }

  Future<void> _handleClaim(String id) async {
    final res = await _api.claimAgencyWithdrawal(id);
    if (res['success'] == true) {
      setState(() {
        _currentlyClaimedId = id;
        _lockSecondsRemaining = 30;
      });
      _startLockTimer();
      _loadData();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message'] ?? "Failed to claim")));
    }
  }

  void _startLockTimer() {
    _lockTimer?.cancel();
    _lockTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_lockSecondsRemaining > 0) {
        setState(() => _lockSecondsRemaining--);
      } else {
        timer.cancel();
        _handleRelease(_currentlyClaimedId ?? '');
      }
    });
  }

  Future<void> _handleRelease(String id) async {
    await _api.releaseAgencyWithdrawalClaim(id);
    setState(() {
      _lockSecondsRemaining = 0;
      _currentlyClaimedId = null;
    });
    _lockTimer?.cancel();
    _loadData();
  }

  void _showSettlementDialog(Map<String, dynamic> withdrawal) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _SettlementSheet(
        withdrawal: withdrawal,
        onComplete: (url) async {
          final res = await _api.helperProcessAgencyWithdrawal(withdrawalId: withdrawal['id'], screenshotUrl: url);
          if (res['success']) {
            _handleRelease(withdrawal['id']);
            Navigator.pop(context);
          }
        },
      ),
    );
  }

  void _showReplyDialog(String messageId) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text("Reply to Admin", style: GoogleFonts.outfit(color: Colors.white)),
        content: TextField(
          controller: controller,
          maxLines: 4,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(hintText: "Enter your message...", hintStyle: TextStyle(color: Colors.white24), border: OutlineInputBorder(borderRadius: BorderRadius.circular(16))),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL")),
          ElevatedButton(onPressed: () async {
            if (controller.text.isEmpty) return;
            await _api.sendHelperAdminMessageReply(messageId, controller.text);
            Navigator.pop(context);
            _loadData();
          }, child: const Text("SEND")),
        ],
      ),
    );
  }

  Widget _buildAccessDenied() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.shieldX, color: Colors.redAccent, size: 80),
          const SizedBox(height: 24),
          Text("ACCESS RESTRICTED", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
          const SizedBox(height: 12),
          Text("Only Level 5 Certified Helpers can access this Nexus.", style: TextStyle(color: Colors.white38, fontSize: 13)),
          const SizedBox(height: 40),
          _buildSecondaryBtn("EXIT HUB", Colors.white, () => Navigator.pop(context)),
        ],
      ),
    );
  }
}

class _SettlementSheet extends StatefulWidget {
  final Map<String, dynamic> withdrawal;
  final Function(String) onComplete;
  const _SettlementSheet({required this.withdrawal, required this.onComplete});

  @override
  State<_SettlementSheet> createState() => _SettlementSheetState();
}

class _SettlementSheetState extends State<_SettlementSheet> {
  File? _image;
  bool _isUploading = false;

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked != null) setState(() => _image = File(picked.path));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(40))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("PROCESS SETTLEMENT", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
          const SizedBox(height: 12),
          Text("Transfer \$${widget.withdrawal['net_usd']} to the agency's provided details and upload proof.", style: TextStyle(color: Colors.white38, fontSize: 13, height: 1.5), textAlign: TextAlign.center),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), borderRadius: BorderRadius.circular(24)),
            child: Row(
              children: [
                const Icon(LucideIcons.info, color: Colors.cyanAccent, size: 20),
                const SizedBox(width: 16),
                Expanded(child: Text(widget.withdrawal['payment_details'] ?? 'No details provided', style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 13))),
              ],
            ),
          ),
          const SizedBox(height: 32),
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              height: 200, width: double.infinity,
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.1), style: BorderStyle.solid)),
              child: _image != null 
                ? ClipRRect(borderRadius: BorderRadius.circular(24), child: Image.file(_image!, fit: BoxFit.cover))
                : Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(LucideIcons.camera, color: Colors.white24, size: 40), const SizedBox(height: 12), Text("UPLOAD PROOF", style: TextStyle(color: Colors.white24, fontSize: 12, fontWeight: FontWeight.bold))]),
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity, height: 60,
            child: ElevatedButton(
              onPressed: (_image == null || _isUploading) ? null : () async {
                setState(() => _isUploading = true);
                final url = await ApiService().uploadChatMedia(_image!.path, 'settlement_proofs');
                if (url != null) widget.onComplete(url);
                setState(() => _isUploading = false);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.greenAccent, foregroundColor: Colors.black, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
              child: _isUploading ? const CircularProgressIndicator(color: Colors.black) : Text("CONFIRM SETTLEMENT", style: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 14)),
            ),
          ),
        ],
      ),
    );
  }
}

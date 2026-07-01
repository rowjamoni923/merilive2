import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class FinanceManagementScreen extends StatefulWidget {
  const FinanceManagementScreen({super.key});

  @override
  State<FinanceManagementScreen> createState() => _FinanceManagementScreenState();
}

class _FinanceManagementScreenState extends State<FinanceManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _withdrawals = [];
  List<Map<String, dynamic>> _topupRequests = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final results = await Future.wait([
      _api.getAdminWithdrawals(),
      _api.getAdminTopupRequests(),
    ]);
    setState(() {
      _withdrawals = results[0] as List<Map<String, dynamic>>;
      _topupRequests = results[1] as List<Map<String, dynamic>>;
      _isLoading = false;
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 32),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildListWrapper("WITHDRAWAL REQUESTS", LucideIcons.wallet, _withdrawals, true),
                _buildListWrapper("MANUAL TOP-UP VERIFICATION", LucideIcons.arrowUpCircle, _topupRequests, false),
                _buildRechargeCampaigns(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "FINANCE GOVERNANCE",
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
        ),
        const Text(
          "Audit withdrawal requests, top-up verifications, and active revenue campaigns",
          style: TextStyle(color: Colors.white38, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildTabs() {
    return Container(
      width: 650,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: const Color(0xFF6366F1),
          borderRadius: BorderRadius.circular(12),
        ),
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "Withdrawals"),
          Tab(text: "Manual Top-up"),
          Tab(text: "Campaigns"),
        ],
      ),
    );
  }

  Widget _buildListWrapper(String title, IconData icon, List<Map<String, dynamic>> items, bool isWithdrawal) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
             Icon(icon, color: Colors.white24, size: 18),
             const SizedBox(width: 12),
             Text(
               title,
               style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
             ),
          ],
        ),
        const SizedBox(height: 24),
        if (items.isEmpty)
          const Expanded(child: Center(child: Text("No pending requests found", style: TextStyle(color: Colors.white24))))
        else
          Expanded(
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                return _buildFinanceItem(items[index], index, isWithdrawal);
              },
            ),
          ),
      ],
    );
  }

  Widget _buildFinanceItem(Map<String, dynamic> item, int index, bool isWithdrawal) {
    final title = isWithdrawal 
        ? (item['agency']?['name'] ?? "Agency Withdrawal")
        : (item['user']?['display_name'] ?? "User Top-up");
    
    final amount = isWithdrawal ? (item['amount_usd'] ?? item['amount'] ?? 0) : (item['amount_usd'] ?? 0);
    final status = (item['status'] ?? 'pending').toString().toUpperCase();

    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white10),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24, 
              backgroundColor: isWithdrawal ? Colors.purple.withOpacity(0.1) : Colors.blue.withOpacity(0.1),
              child: Icon(
                isWithdrawal ? LucideIcons.building2 : LucideIcons.user,
                size: 20,
                color: isWithdrawal ? Colors.purpleAccent : Colors.blueAccent,
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(
                    "USD \$${_api.formatNumber(amount)} \u2022 ${isWithdrawal ? 'Agency' : 'User'}",
                    style: const TextStyle(color: Colors.white38, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (item['status'] == 'pending')
              Row(
                children: [
                  _buildActionBtn("APPROVE", Colors.greenAccent, onTap: () async {
                    bool ok = isWithdrawal 
                        ? await _api.processAdminWithdrawal(item['id'], 'approved')
                        : await _api.adminProcessTopup(item['id'], 'approved');
                    if (ok) _loadData();
                  }),
                  const SizedBox(width: 12),
                  _buildActionBtn("REJECT", Colors.redAccent, onTap: () async {
                    bool ok = isWithdrawal 
                        ? await _api.processAdminWithdrawal(item['id'], 'rejected')
                        : await _api.adminProcessTopup(item['id'], 'rejected');
                    if (ok) _loadData();
                  }),
                ],
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: (item['status'] == 'approved' ? Colors.greenAccent : Colors.redAccent).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    color: item['status'] == 'approved' ? Colors.greenAccent : Colors.redAccent,
                    fontWeight: FontWeight.bold,
                    fontSize: 10,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRechargeCampaigns() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "ACTIVE RECHARGE CAMPAIGNS",
              style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
            ),
            _buildActionBtn("+ NEW CAMPAIGN", const Color(0xFF6366F1)),
          ],
        ),
        const SizedBox(height: 24),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 2.2,
              crossAxisSpacing: 24,
              mainAxisSpacing: 24,
            ),
            itemCount: 2,
            itemBuilder: (context, index) {
              return FadeInUp(
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                           Container(
                             padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                             decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                             child: const Text("LIVE", style: TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                           ),
                           const Icon(LucideIcons.edit, color: Colors.white24, size: 16),
                        ],
                      ),
                      const Spacer(),
                      const Text("Mega Bonus 40%", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
                      const Text("Validity: Apr 19 - Apr 25, 2026", style: TextStyle(color: Colors.white38, fontSize: 12)),
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

  Widget _buildActionBtn(String label, Color color, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

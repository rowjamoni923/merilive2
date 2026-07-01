import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class SubAdminManagementScreen extends StatefulWidget {
  const SubAdminManagementScreen({super.key});

  @override
  State<SubAdminManagementScreen> createState() => _SubAdminManagementScreenState();
}

class _SubAdminManagementScreenState extends State<SubAdminManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  List<Map<String, dynamic>> _subAdmins = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final res = await _api.getAdminSubAdmins();
    setState(() {
      _subAdmins = res;
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
                _buildSubAdminTab(),
                _buildDeviceApprovalTab(),
                _buildOwnerAccessTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "SUPERVISOR GOVERNANCE",
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
            ),
            const Text(
              "Manage sub-admins, device approvals, and owner-level access",
              style: TextStyle(color: Colors.white38, fontSize: 14),
            ),
          ],
        ),
        _buildActionBtn("+ ADD SUPERVISOR", const Color(0xFF6366F1)),
      ],
    );
  }

  Widget _buildTabs() {
    return Container(
      width: 600,
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
          Tab(text: "Sub-Admins"),
          Tab(text: "Device Approval"),
          Tab(text: "Owner Access"),
        ],
      ),
    );
  }

  Widget _buildSubAdminTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    }
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildRoleSummary(),
        const SizedBox(height: 32),
        Expanded(child: _buildSubAdminList()),
      ],
    );
  }

  Widget _buildRoleSummary() {
    int superAdmins = _subAdmins.where((s) => s['role'] == 'super_admin').length;
    int moderators = _subAdmins.where((s) => s['role'] == 'moderator').length;
    int finance = _subAdmins.where((s) => s['role'] == 'finance').length;

    return Row(
      children: [
        _buildStatCard("Super Admins", superAdmins.toString(), Colors.amber, LucideIcons.crown),
        const SizedBox(width: 20),
        _buildStatCard("Moderators", moderators.toString(), Colors.blueAccent, LucideIcons.shield),
        const SizedBox(width: 20),
        _buildStatCard("Finance Officers", finance.toString(), Colors.greenAccent, LucideIcons.coins),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: color.withOpacity(0.04),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                Text(
                  label.toUpperCase(),
                  style: TextStyle(color: color.withOpacity(0.6), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubAdminList() {
    if (_subAdmins.isEmpty) {
      return const Center(child: Text("No supervisors found", style: TextStyle(color: Colors.white24)));
    }

    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.8,
        crossAxisSpacing: 20,
        mainAxisSpacing: 20,
      ),
      itemCount: _subAdmins.length,
      itemBuilder: (context, index) {
        final admin = _subAdmins[index];
        final profile = admin['user'] ?? {};
        String role = (admin['role'] ?? 'MODERATOR').toString().toUpperCase().replaceAll('_', ' ');
        Color color = admin['role'] == 'super_admin' ? Colors.amber : Colors.blueAccent;

        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white10),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundImage: profile['avatar_url'] != null ? NetworkImage(profile['avatar_url']) : null,
                  backgroundColor: Colors.white12,
                  child: profile['avatar_url'] == null ? const Icon(LucideIcons.user, color: Colors.white24) : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        profile['display_name'] ?? 'Supervisor',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text("UID: ${profile['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: color.withOpacity(0.2)),
                        ),
                        child: Text(
                          role,
                          style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(LucideIcons.moreVertical, color: Colors.white24),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildDeviceApprovalTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.smartphone, size: 64, color: Colors.white10),
          const SizedBox(height: 16),
          Text(
            "DEVICE APPROVAL QUEUE",
            style: GoogleFonts.outfit(color: Colors.white24, fontWeight: FontWeight.bold),
          ),
          const Text("No pending devices to approve", style: TextStyle(color: Colors.white10, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildOwnerAccessTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.lock, size: 64, color: Colors.white10),
          const SizedBox(height: 16),
          Text(
            "OWNER ACCESS CONTROL",
            style: GoogleFonts.outfit(color: Colors.white24, fontWeight: FontWeight.bold),
          ),
          const Text("High-level system permissions", style: TextStyle(color: Colors.white10, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildActionBtn(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [color, color.withOpacity(0.7)]),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: color.withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
      ),
    );
  }
}

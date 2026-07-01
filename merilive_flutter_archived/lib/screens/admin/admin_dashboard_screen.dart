import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'admin_navigation_config.dart';
import 'admin_reports_screen.dart';
import 'admin_moderation_screen.dart';
import 'admin_blocked_users_screen.dart';
import 'admin_live_bans_screen.dart';
import 'admin_user_reports_screen.dart';
import 'admin_face_violations_screen.dart';
import 'admin_topup_system_screen.dart';
import 'admin_payment_gateways_screen.dart';
import 'admin_topup_methods_screen.dart';
import 'admin_recharge_history_screen.dart';
import 'admin_recharge_campaigns_screen.dart';
import 'user_management_screen.dart';
import 'user_hub_screen.dart';
import 'agency_hub_screen.dart';
import 'finance_management_screen.dart';
import 'visual_assets_hub_screen.dart';
import 'agency_management_screen.dart';
import 'host_applications_screen.dart';
import 'support_tickets_screen.dart';
import 'system_management_screen.dart';
import 'host_management_screen.dart';
import 'commission_management_screen.dart';
import 'face_verification_screen.dart';
import 'level_management_screen.dart';
import 'noble_management_screen.dart';
import 'payroll_orders_screen.dart';
import 'announcement_management_screen.dart';
import 'agora_settings_screen.dart';
import 'agency_withdrawal_screen.dart';
import 'transfer_history_screen.dart';
import 'balance_deduction_screen.dart';
import 'manual_topup_screen.dart';
import 'ranking_rewards_screen.dart';
import 'game_management_screen.dart';
import 'party_management_screen.dart';
import 'admin_app_settings_hub_screen.dart';
import 'admin_game_system_hub_screen.dart';
import 'admin_branding_screen.dart';
import 'admin_app_version_screen.dart';
import 'admin_shop_screen.dart';
import 'admin_entry_effects_screen.dart';
import 'admin_chat_bubbles_screen.dart';
import 'admin_notification_templates_screen.dart';
import 'admin_allowed_links_screen.dart';
import 'admin_beauty_sdk_screen.dart';
import 'admin_user_system_hub_screen.dart';
import 'admin_shop_system_hub_screen.dart';
import 'admin_moderation_hub_screen.dart';
import 'admin_visual_assets_hub_screen.dart';
import 'admin_finance_system_hub_screen.dart';
import 'admin_diamond_trader_hub_screen.dart';
import 'admin_agency_system_hub_screen.dart';
import 'admin_vip_noble_hub_screen.dart';
import 'admin_level_system_hub_screen.dart';
import '../level5_helper_dashboard.dart';
import 'admin_gmail_broadcast_screen.dart';
import 'admin_host_applications_screen.dart';
import 'admin_system_health_screen.dart';
import 'admin_pk_management_screen.dart';
import 'admin_party_system_hub_screen.dart';
import 'admin_user_support_tool_screen.dart';
import 'admin_push_notification_screen.dart';
import 'admin_quick_links_screen.dart';
import 'admin_rating_rewards_screen.dart';
import 'admin_route_guard.dart';
import 'admin_transfer_scheduler_screen.dart';
import 'admin_streams_screen.dart';
import 'admin_parcel_management_screen.dart';
import 'admin_reward_claims_history_screen.dart';
import 'admin_device_management_screen.dart';
import 'admin_app_settings_hub_screen.dart';
import 'admin_event_themes_screen.dart';
import 'admin_landing_page_manager_screen.dart';
import 'admin_campaign_templates_screen.dart';
import 'admin_activity_records_screen.dart';
import 'admin_recordings_screen.dart';
import 'admin_reels_screen.dart';
import 'admin_tasks_settings_screen.dart';
import 'admin_call_settings_screen.dart';
import 'admin_contact_violations_screen.dart';
import 'admin_number_sharing_screen.dart';
import 'admin_verified_badges_screen.dart';
import 'admin_blueprint_screen.dart';
import 'admin_error_logs_screen.dart';
import 'admin_onboarding_slides_screen.dart';
import 'admin_rewards_management_screen.dart';
import 'admin_vehicle_entrances_screen.dart';
import 'admin_role_frames_screen.dart';
import 'admin_today_calls_screen.dart';
import 'admin_animation_store_screen.dart';
import 'admin_frames_screen.dart';
import 'admin_gifts_screen.dart';
import 'admin_game_settings_screen.dart';
import 'admin_helper_applications_screen.dart';
import 'admin_invitation_settings_screen.dart';
import 'admin_popup_banners_screen.dart';
import 'admin_trader_orders_screen.dart';
import 'admin_trader_transactions_screen.dart';
import 'admin_leaderboard_management_screen.dart';
import 'admin_host_conversion_screen.dart';
import 'admin_user_beans_exchange_screen.dart';
import 'admin_gmail_support_screen.dart';
import 'admin_game_providers_screen.dart';
import 'admin_game_server_screen.dart';
import 'admin_chat_inspector_screen.dart';
import 'admin_gift_transactions_screen.dart';
import 'admin_game_leaderboard_screen.dart';
import 'admin_helper_requests_screen.dart';
import 'admin_helper_diamond_pricing_screen.dart';
import 'admin_helper_orders_screen.dart';
import 'admin_content_screen.dart';
import 'admin_theme_manager_screen.dart';
import 'admin_coins_screen.dart';
import 'admin_balance_deduction_screen.dart';
import 'admin_notice_broadcast_screen.dart';
import 'admin_push_broadcast_screen.dart';
import 'admin_email_broadcast_screen.dart';
import 'admin_icon_registry_screen.dart';
import 'admin_room_welcome_messages_screen.dart';
import 'admin_online_users_screen.dart';
import 'visual/admin_entry_assets_hub.dart';
import '../../services/api_service.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  String _selectedPath = "/admin";
  String _searchQuery = "";
  bool _isLoading = true;
  bool _isRefreshing = false;
  Map<String, dynamic> _stats = {};
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _recentActivities = [];
  DateTime? _lastRefreshTime;
  RealtimeChannel? _auditChannel;

  void _setupRealtimeAudit() {
    _auditChannel?.unsubscribe();
    _auditChannel = _api.getSupabase()
        .channel('admin_audit_logs')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'admin_audit_logs',
          callback: (payload) {
            if (mounted && payload.newRecord.isNotEmpty) {
              setState(() {
                _recentActivities.insert(0, payload.newRecord);
                if (_recentActivities.length > 20) _recentActivities.removeLast();
              });
            }
          },
        )
        .subscribe();
  }

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    if (mounted) setState(() => _isRefreshing = true);
    try {
      // Parallel fetch for speed (Master Copy Logic)
      final results = await Future.wait([
        _api.getAdminDashboardStats(),
        _api.getMyProfile(),
        _api.getAdminLogs(limit: 10),
      ]);
      
      _setupRealtimeAudit();

      if (mounted) {
        setState(() {
          _stats = results[0] as Map<String, dynamic>;
          _profile = results[1] as Map<String, dynamic>?;
          _recentActivities = results[2] as List<Map<String, dynamic>>;
          _isLoading = false;
          _isRefreshing = false;
          _lastRefreshTime = DateTime.now();
        });
      }
    } catch (e) {
      if (mounted) setState(() { _isLoading = false; _isRefreshing = false; });
    }
  }

  List<AdminNavGroup> get _filteredNavGroups {
    if (_searchQuery.isEmpty) return adminNavGroups;
    return adminNavGroups.map((group) {
      final filteredItems = group.items.where((item) => 
        item.label.toLowerCase().contains(_searchQuery.toLowerCase())
      ).toList();
      if (filteredItems.isEmpty && !group.title.toLowerCase().contains(_searchQuery.toLowerCase())) return null;
      return AdminNavGroup(title: group.title, items: filteredItems.isNotEmpty ? filteredItems : group.items);
    }).whereType<AdminNavGroup>().toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      body: Row(
        children: [
          _buildSidebar(),
          Expanded(
            child: SafeArea(
              child: Column(
                children: [
                  _buildHeader(),
                  Expanded(child: _buildBody()),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSidebar() {
    return Container(
      width: 280,
      decoration: const BoxDecoration(
        color: Color(0xFF0C0C14),
        border: Border(right: BorderSide(color: Colors.white10, width: 0.5)),
      ),
      child: Column(
        children: [
          _buildSidebarBrand(),
          _buildSidebarSearch(),
          const SizedBox(height: 12),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 10),
              itemCount: _filteredNavGroups.length,
              itemBuilder: (context, index) {
                final group = _filteredNavGroups[index];
                return _buildNavGroup(group);
              },
            ),
          ),
          _buildSidebarFooter(),
        ],
      ),
    );
  }

  Widget _buildSidebarBrand() {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.3), blurRadius: 12)],
            ),
            child: const Icon(LucideIcons.shield, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("MERILIVE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
              const Text("Command Center", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSidebarSearch() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        height: 44,
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
        child: TextField(
          controller: _searchController,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: const InputDecoration(
            hintText: "Search operations...",
            hintStyle: TextStyle(color: Colors.white24, fontSize: 12),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white24, size: 16),
            border: InputBorder.none,
            contentPadding: EdgeInsets.symmetric(vertical: 10),
          ),
          onChanged: (val) => setState(() => _searchQuery = val),
        ),
      ),
    );
  }

  Widget _buildSidebarFooter() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: Colors.white10, width: 0.5))),
      child: InkWell(
        onTap: () => Navigator.pop(context),
        child: Row(
          children: [
            Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.logOut, color: Colors.redAccent, size: 16)),
            const SizedBox(width: 12),
            const Text("Exit Console", style: TextStyle(color: Colors.redAccent, fontSize: 14, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildNavGroup(AdminNavGroup group) {
    bool hasSelected = group.items.any((item) => item.path == _selectedPath);
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        initiallyExpanded: hasSelected || _searchQuery.isNotEmpty,
        title: Text(group.title.toUpperCase(), style: GoogleFonts.outfit(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        iconColor: Colors.white10,
        collapsedIconColor: Colors.white10,
        children: group.items.map((item) => _buildNavItem(item)).toList(),
      ),
    );
  }

  Widget _buildNavItem(AdminNavItem item) {
    bool isSelected = _selectedPath == item.path;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      child: InkWell(
        onTap: () => setState(() => _selectedPath = item.path),
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF6366F1).withOpacity(0.08) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: isSelected ? const Color(0xFF6366F1).withOpacity(0.2) : Colors.transparent),
          ),
          child: Row(
            children: [
              Icon(item.icon, color: isSelected ? const Color(0xFF6366F1) : Colors.white24, size: 16),
              const SizedBox(width: 12),
              Expanded(child: Text(item.label, style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white38, fontSize: 13, fontWeight: isSelected ? FontWeight.bold : FontWeight.w500))),
              if (isSelected) Container(width: 4, height: 4, decoration: const BoxDecoration(color: Color(0xFF6366F1), shape: BoxShape.circle)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 24),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white10, width: 0.5))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
                  borderRadius: BorderRadius.circular(16),
                  shadows: [BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.2), blurRadius: 12)],
                ),
                child: const Icon(LucideIcons.barChart3, color: Colors.white, size: 24),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_getCurrentLabel(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                  Row(
                    children: [
                      const Text("Live overview", style: TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.w500)),
                      if (_lastRefreshTime != null) Text(" • ${DateFormat('hh:mm a').format(_lastRefreshTime!)}", style: const TextStyle(color: Colors.white10, fontSize: 11)),
                    ],
                  ),
                ],
              ),
            ],
          ),
          Row(
            children: [
              _buildHeaderIcon(LucideIcons.refreshCw, onTap: _loadStats, isLoading: _isRefreshing),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: Colors.emerald.withOpacity(0.05), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.emerald.withOpacity(0.2))),
                child: Row(
                  children: [
                    Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.emerald, shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    const Text("LIVE", style: TextStyle(color: Colors.emerald, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
                  ],
                ),
              ),
              const SizedBox(width: 24),
              _buildProfileSnippet(),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfileSnippet() {
    return Row(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(_profile?['display_name'] ?? 'Admin', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            const Text("Official Owner", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(width: 16),
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFF6366F1), width: 2), image: DecorationImage(image: NetworkImage(_profile?['avatar_url'] ?? ''), fit: BoxFit.cover)),
        ),
      ],
    );
  }

  String _getCurrentLabel() {
    if (_selectedPath == "/admin") return "Command Center";
    for (var g in adminNavGroups) {
      for (var item in g.items) if (item.path == _selectedPath) return item.label;
    }
    return "Dashboard";
  }

  Widget _buildHeaderIcon(IconData icon, {VoidCallback? onTap, bool isLoading = false}) {
    return InkWell(
      onTap: isLoading ? null : onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
        child: isLoading 
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white24, strokeWidth: 2))
          : Icon(icon, color: Colors.white38, size: 18),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    switch (_selectedPath) {
      case "/admin": return _buildOverview();
      case "/admin/reports": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminReportsScreen());
      
      // User Hub
      case "/admin/user-hub": return const AdminRouteGuard(hubKey: 'user-hub', child: UserHubScreen());
      case "/admin/user-management": return const AdminRouteGuard(hubKey: 'user-hub', child: AdminUserSystemHubScreen());
      case "/admin/users": return const AdminRouteGuard(hubKey: 'user-hub', child: AdminUserSystemHubScreen());
      case "/admin/host-applications": return const AdminRouteGuard(hubKey: 'user-hub', child: AdminHostApplicationsScreen());
      case "/admin/host-search": return const AdminRouteGuard(hubKey: 'user-hub', child: UserHubScreen());
      case "/admin/hosts": return const AdminRouteGuard(hubKey: 'user-hub', child: HostManagementScreen());

      // Agency Hub
      case "/admin/agency-hub": return const AdminRouteGuard(hubKey: 'agency-hub', child: AdminAgencySystemHubScreen());
      case "/admin/agencies": return const AdminRouteGuard(hubKey: 'agency-hub', child: AdminAgencySystemHubScreen());
      case "/admin/agency-policy": return const AdminRouteGuard(hubKey: 'agency-hub', child: AdminAgencySystemHubScreen());
      case "/admin/commissions": return const AdminRouteGuard(hubKey: 'agency-hub', child: CommissionManagementScreen());
      case "/admin/commission-calculator": return const AdminRouteGuard(hubKey: 'agency-hub', child: AdminAgencySystemHubScreen());

      // Moderation
      case "/admin/moderation": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminModerationHubScreen());
      case "/admin/face-verification": return const AdminRouteGuard(hubKey: 'moderation-hub', child: FaceVerificationScreen());
      case "/admin/blocked": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminBlockedUsersScreen());
      case "/admin/live-bans": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminLiveBansScreen());
      case "/admin/face-violations": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminFaceViolationsScreen());
      case "/admin/user-reports": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminUserReportsScreen());
      case "/admin/device-management": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminDeviceManagementScreen());
      case "/admin/number-sharing": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminNumberSharingScreen());
      case "/admin/contact-violations": return const AdminRouteGuard(hubKey: 'moderation-hub', child: AdminContactViolationsScreen());

      // Finance
      case "/admin/finance": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminFinanceSystemHubScreen());
      case "/admin/coin-trader-hub": return const AdminRouteGuard(hubKey: 'trader-hub', child: AdminDiamondTraderHubScreen());
      case "/admin/coin-traders": return const AdminRouteGuard(hubKey: 'trader-hub', child: AdminDiamondTraderHubScreen());
      case "/admin/coin-traders/orders": return const AdminRouteGuard(hubKey: 'trader-hub', child: AdminDiamondTraderHubScreen());
      case "/admin/coin-traders/transactions": return const AdminRouteGuard(hubKey: 'trader-hub', child: AdminDiamondTraderHubScreen());
      case "/admin/coins": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminCoinsScreen());
      case "/admin/topup-system": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminTopupSystemScreen());
      case "/admin/manual-topup": return const AdminRouteGuard(hubKey: 'finance-hub', child: ManualTopupScreen());
      case "/admin/withdrawals": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminFinanceSystemHubScreen());
      case "/admin/balance-deduction": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminBalanceDeductionScreen());
      case "/admin/transfer-history": return const AdminRouteGuard(hubKey: 'finance-hub', child: TransferHistoryScreen());
      case "/admin/recharge-history": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminRechargeHistoryScreen());
      case "/admin/payroll-orders": return const AdminRouteGuard(hubKey: 'finance-hub', child: PayrollOrdersScreen());
      case "/admin/user-beans-exchange": return const AdminRouteGuard(hubKey: 'finance-hub', child: AdminUserBeansExchangeScreen());

      // Store
      case "/admin/visual-assets": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminVisualAssetsHubScreen());
      case "/admin/shop": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminShopScreen());
      case "/admin/gifts": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminGiftsScreen());
      case "/admin/frames": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminFramesScreen());
      case "/admin/entry-effects": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminEntryEffectsScreen());
      case "/admin/chat-bubbles": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminChatBubblesScreen());
      case "/admin/animation-store": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminAnimationStoreScreen());
      case "/admin/beauty-filters": return const AdminRouteGuard(hubKey: 'visual-hub', child: AdminBeautySdkScreen());

      // Level System
      case "/admin/level-management": return const AdminRouteGuard(hubKey: 'level-hub', child: AdminLevelSystemHubScreen());
      case "/admin/level-tiers": return const AdminRouteGuard(hubKey: 'level-hub', child: AdminLevelSystemHubScreen());
      case "/admin/ranking-rewards": return const AdminRouteGuard(hubKey: 'level-hub', child: AdminRankingRewardsScreen());
      case "/admin/feature-levels": return const AdminRouteGuard(hubKey: 'level-hub', child: AdminLevelSystemHubScreen());

      // VIP & Noble
      case "/admin/vip-management": return const AdminRouteGuard(hubKey: 'vip-hub', child: AdminVipNobleHubScreen());
      case "/admin/noble-cards": return const AdminRouteGuard(hubKey: 'vip-hub', child: AdminVipNobleHubScreen());
      case "/admin/vip-medals": return const AdminRouteGuard(hubKey: 'vip-hub', child: AdminVipNobleHubScreen());

      // Games
      case "/admin/game-management": return const AdminRouteGuard(hubKey: 'game-hub', child: AdminGameSystemHubScreen());
      case "/admin/game-settings": return const AdminRouteGuard(hubKey: 'game-hub', child: AdminGameSettingsScreen());
      case "/admin/game-leaderboard": return const AdminRouteGuard(hubKey: 'game-hub', child: AdminGameLeaderboardScreen());

      // Calling
      case "/admin/call-settings": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminCallSettingsScreen());
      case "/admin/agora-settings": return const AdminRouteGuard(hubKey: 'settings-hub', child: AgoraSettingsScreen());

      // Content
      case "/admin/content-management": return const AdminRouteGuard(hubKey: 'content-hub', child: ContentManagementHubScreen());
      case "/admin/banners": return const AdminRouteGuard(hubKey: 'content-hub', child: AdminVisualAssetsHubScreen());
      case "/admin/streams": return const AdminRouteGuard(hubKey: 'content-hub', child: AdminStreamsScreen());
      case "/admin/reels": return const AdminRouteGuard(hubKey: 'content-hub', child: AdminReelsScreen());
      case "/admin/leaderboard-management": return const AdminRouteGuard(hubKey: 'content-hub', child: AdminLeaderboardManagementScreen());

      // Settings
      case "/admin/app-settings-hub": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminAppSettingsHubScreen());
      case "/admin/branding": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminBrandingScreen());
      case "/admin/popup-banners": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminPopupBannersScreen());
      case "/admin/app-version": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminAppVersionScreen());
      case "/admin/theme-manager": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminThemeManagerScreen());
      case "/admin/sub-admins": return const AdminRouteGuard(hubKey: 'settings-hub', child: SubAdminManagementScreen());

      // Debug & Logs
      case "/admin/logs": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminActivityRecordsScreen());
      case "/admin/error-logs": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminErrorLogsScreen());
      case "/admin/blueprint": return const AdminRouteGuard(hubKey: 'settings-hub', child: AdminBlueprintScreen());

      default: return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.code, color: Colors.white10, size: 64),
            const SizedBox(height: 24),
            Text("${_getCurrentLabel()} is under construction", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            const Text("This module will achieve 100% web parity in the next sync.", style: TextStyle(color: Colors.white10, fontSize: 12)),
          ],
        ),
      );
    }
  }

  Widget _buildOverview() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        children: [
          _buildStatsGrid(),
          const SizedBox(height: 32),
          _buildAlertStrip(),
          const SizedBox(height: 48),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 1, child: _buildQuickActions()),
              const SizedBox(width: 48),
              Expanded(flex: 2, child: _buildRecentActivity()),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    return LayoutBuilder(
      builder: (context, constraints) {
        int crossAxisCount = constraints.maxWidth > 1200 ? 4 : 2;
        return GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: crossAxisCount,
          crossAxisSpacing: 24,
          mainAxisSpacing: 24,
          childAspectRatio: 1.8,
          children: [
            _buildStatCard("Total Users", _stats['total_users'] ?? 0, LucideIcons.users, [const Color(0xFF3B82F6), const Color(0xFF06B6D4)], "#3b82f6", onTap: () => setState(() => _selectedPath = "/admin/users")),
            _buildStatCard("Total Hosts", _stats['total_hosts'] ?? 0, LucideIcons.userCheck, [const Color(0xFF8B5CF6), const Color(0xFFA855F7)], "#8b5cf6", onTap: () => setState(() => _selectedPath = "/admin/hosts")),
            _buildStatCard("Total Agencies", _stats['total_agencies'] ?? 0, LucideIcons.building2, [const Color(0xFF6366F1), const Color(0xFF3B82F6)], "#6366f1", onTap: () => setState(() => _selectedPath = "/admin/agencies")),
            _buildStatCard("Online Now", _stats['online_users'] ?? 0, LucideIcons.eye, [const Color(0xFF10B981), const Color(0xFF14B8A6)], "#10b981"),
            _buildStatCard("Active Streams", _stats['active_streams'] ?? 0, LucideIcons.video, [const Color(0xFFF43F5E), const Color(0xFFEC4899)], "#f43f5e"),
            _buildStatCard("Party Rooms", _stats['active_party_rooms'] ?? 0, LucideIcons.partyPopper, [const Color(0xFFF97316), const Color(0xFFF59E0B)], "#f97316"),
            _buildStatCard("Today's Gifts", _api.formatNumber(_stats['total_gifts_today'] ?? 0), LucideIcons.gift, [const Color(0xFFD946EF), const Color(0xFFEC4899)], "#d946ef"),
            _buildStatCard("Today's Calls", _stats['total_calls_today'] ?? 0, LucideIcons.phone, [const Color(0xFF0EA5E9), const Color(0xFF3B82F6)], "#0ea5e9"),
          ],
        );
      },
    );
  }

  Widget _buildStatCard(String label, dynamic value, IconData icon, List<Color> colors, String glow, {VoidCallback? onTap}) {
    return FadeInUp(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(28),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.02),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white10),
            boxShadow: [BoxShadow(color: Color(int.parse(glow.replaceFirst('#', '0xFF'))).withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 8))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: Stack(
              children: [
                Positioned(right: -20, top: -20, child: Container(width: 100, height: 100, decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [colors[0].withOpacity(0.15), Colors.transparent])))),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(gradient: LinearGradient(colors: colors), borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: Colors.white, size: 20)),
                          const Icon(LucideIcons.arrowUpRight, color: Colors.white10, size: 16),
                        ],
                      ),
                      const Spacer(),
                      Text(value.toString(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1)),
                      const SizedBox(height: 2),
                      Text(label.toUpperCase(), style: GoogleFonts.outfit(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAlertStrip() {
    return Row(
      children: [
        Expanded(child: _buildAlertCard("Pending Host Apps", _stats['pending_host_applications'] ?? 0, LucideIcons.clock, Colors.amber, "/admin/host-applications")),
        const SizedBox(width: 16),
        Expanded(child: _buildAlertCard("Blocked Users", _stats['blocked_users'] ?? 0, LucideIcons.ban, Colors.redAccent, "/admin/blocked")),
        const SizedBox(width: 16),
        Expanded(child: _buildAlertCard("Blocked Agencies", _stats['blocked_agencies'] ?? 0, LucideIcons.building2, Colors.orangeAccent, "/admin/agencies")),
      ],
    );
  }

  Widget _buildAlertCard(String label, int value, IconData icon, Color color, String path) {
    return InkWell(
      onTap: () => setState(() => _selectedPath = path),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.15))),
        child: Row(
          children: [
            Container(width: 48, height: 48, decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(14)), child: Icon(icon, color: color, size: 24)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value.toString(), style: GoogleFonts.outfit(color: color, fontSize: 24, fontWeight: FontWeight.w900)),
                  Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, color: Colors.white10, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(LucideIcons.zap, color: Colors.amber, size: 16),
            const SizedBox(width: 8),
            Text("QUICK ACTIONS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
          ],
        ),
        const SizedBox(height: 24),
        _buildActionItem("Host Applications", "Review new applications", LucideIcons.shield, const Color(0xFFA78BFA), "/admin/host-applications"),
        _buildActionItem("Commissions", "Manage rates & payouts", LucideIcons.percent, const Color(0xFFF97316), "/admin/commissions"),
        _buildActionItem("Withdrawals", "Process pending requests", LucideIcons.wallet, const Color(0xFF10B981), "/admin/withdrawals"),
        _buildActionItem("System Settings", "Configure platform", LucideIcons.settings, const Color(0xFFEC4899), "/admin/settings"),
      ],
    );
  }

  Widget _buildActionItem(String title, String desc, IconData icon, Color color, String path) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => setState(() => _selectedPath = path),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Container(width: 2, height: 24, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 16),
              Container(width: 32, height: 32, decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: color, size: 16)),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                    Text(desc, style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, color: Colors.white10, size: 14),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentActivity() {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white10)),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.activity, color: Colors.emeraldAccent, size: 18),
                    const SizedBox(width: 12),
                    Text("SYSTEM ACTIVITY AUDIT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                  ],
                ),
                _buildMiniBtn("REFRESH", LucideIcons.refreshCw, onTap: _loadStats),
              ],
            ),
          ),
          const Divider(color: Colors.white10, height: 1),
          if (_recentActivities.isEmpty)
             const Padding(padding: EdgeInsets.all(60), child: Text("No audit logs found", style: TextStyle(color: Colors.white24, fontSize: 13)))
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _recentActivities.length,
              separatorBuilder: (c, i) => const Divider(color: Colors.white10, height: 1, indent: 32, endIndent: 32),
              itemBuilder: (context, index) {
                final log = _recentActivities[index];
                return _buildActivityTile(log);
              },
            ),
        ],
      ),
    );
  }

  Widget _buildActivityTile(Map<String, dynamic> log) {
    final type = log['action_type'] ?? '';
    final color = _resolveLogColor(type);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
      child: Row(
        children: [
          Container(
            width: 10, height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: color.withOpacity(0.3), width: 3)),
          ),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(log['description'] ?? type, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                Text(_formatTime(log['created_at']), style: const TextStyle(color: Colors.white24, fontSize: 11)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(6), border: Border.all(color: Colors.white10)),
            child: Text((log['target_type'] ?? 'ACTION').toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniBtn(String label, IconData icon, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.3))),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF6366F1), size: 12),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(color: Color(0xFF6366F1), fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
          ],
        ),
      ),
    );
  }

  IconData _resolveLogIcon(String? type) {
    if (type == null) return LucideIcons.activity;
    if (type.contains('block')) return LucideIcons.ban;
    if (type.contains('approve')) return LucideIcons.checkCircle;
    if (type.contains('reject')) return LucideIcons.xCircle;
    if (type.contains('login')) return LucideIcons.logIn;
    return LucideIcons.activity;
  }

  Color _resolveLogColor(String? type) {
    if (type == null) return Colors.blueAccent;
    if (type.contains('block')) return Colors.redAccent;
    if (type.contains('approve')) return Colors.greenAccent;
    if (type.contains('reject')) return Colors.orangeAccent;
    return Colors.blueAccent;
  }

  String _formatTime(dynamic date) {
    if (date == null) return "Just now";
    try {
      final dt = DateTime.parse(date.toString());
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return "Just now";
      if (diff.inMinutes < 60) return "${diff.inMinutes}m ago";
      if (diff.inHours < 24) return "${diff.inHours}h ago";
      return DateFormat('MMM dd, hh:mm a').format(dt);
    } catch (e) { return "Recently"; }
  }

  @override
  void dispose() {
    _auditChannel?.unsubscribe();
    _searchController.dispose();
    super.dispose();
  }
}

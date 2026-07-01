import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shimmer/shimmer.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:share_plus/share_plus.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyDashboardScreen extends StatefulWidget {
  const AgencyDashboardScreen({super.key});

  @override
  State<AgencyDashboardScreen> createState() => _AgencyDashboardScreenState();
}

class _AgencyDashboardScreenState extends State<AgencyDashboardScreen> with TickerProviderStateMixin {
  final ApiService _api = ApiService();
  final AudioPlayer _audioPlayer = AudioPlayer();
  late TabController _tabController;
  bool _isLoading = true;
  bool _isLevel5 = false;
  Map<String, dynamic>? _agency;
  Map<String, dynamic>? _parentAgency;
  List<Map<String, dynamic>> _pendingHosts = [];
  List<Map<String, dynamic>> _activeHosts = [];
  Map<String, dynamic> _finance = {};
  Map<String, dynamic>? _countryConfig;
  int _prevPendingCount = 0;
  int _pendingHelperRequests = 0;
  double _totalCommission = 0;
  double _totalHostEarnings = 0;
  double _totalWithdrawn = 0;
  int _ownerPersonalBeans = 0;
  int _subAgencyCount = 0;
  int _subAgentCount = 0;
  List<Map<String, dynamic>> _performanceHistory = [];
  List<Map<String, dynamic>> _recentWithdrawals = [];
  String _subAgentLink = "";
  String _hostJoinLink = "";
  final List<StreamSubscription> _subscriptions = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
    _setupRealtime();
  }

  @override
  void dispose() {
    for (var sub in _subscriptions) {
      sub.cancel();
    }
    _tabController.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  void _playSound() async {
    try {
      SystemSound.play(SystemSoundType.click);
    } catch (e) {
      debugPrint("Sound error: $e");
    }
  }

  void _setupRealtime() {
    final supa = _api.getSupabase();
    final userId = _api.currentUserId;
    if (userId == null) return;

    _subscriptions.add(supa
        .from('agency_hosts')
        .stream(primaryKey: ['id'])
        .eq('status', 'pending')
        .listen((data) {
          if (data.length > _prevPendingCount) {
            _playSound();
            _loadData(); 
          }
          _prevPendingCount = data.length;
        }));

    _subscriptions.add(supa.from('agencies').stream(primaryKey: ['id']).eq('owner_id', userId).listen((data) {
      if (data.isNotEmpty && mounted) {
        setState(() => _agency = data.first);
      }
    }));
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile == null) return;

      final agencyId = profile['agency_id'] ?? profile['id'];

      final results = await Future.wait([
        _api.getAgencyDashboardStats(agencyId),
        _api.getFinanceSettings(),
        _api.getAgencyEarningsHistory(agencyId),
        _api.getCountryConfig(profile['country_code'] ?? 'US'),
        _api.getAgencyWithdrawalHistory(agencyId),
        _api.getAgencyHosts(agencyId, 'active'),
      ]);

      final stats = results[0] as Map<String, dynamic>;
      final finance = results[1] as Map<String, dynamic>;
      final earnings = results[2] as List<Map<String, dynamic>>;
      final country = results[3] as Map<String, dynamic>?;
      final withdrawals = results[4] as List<Map<String, dynamic>>;
      final activeHosts = results[5] as List<Map<String, dynamic>>;

      bool isPayrollAgency = false;
      int helperPending = 0;
      if (stats['helper'] != null && stats['helper']['is_verified'] == true) {
        final helper = stats['helper'];
        isPayrollAgency = helper['trader_level'] == 5 && helper['payroll_enabled'] == true;
        
        final helperId = helper['id'];
        final topupCount = await _api.getSupabase()
            .from('helper_orders')
            .select('id', count: CountOption.exact)
            .eq('helper_id', helperId)
            .eq('status', 'pending');
        helperPending += (topupCount.count ?? 0);
        
        if (isPayrollAgency) {
          final withCount = await _api.getSupabase()
              .from('agency_withdrawals')
              .select('id', count: CountOption.exact)
              .eq('status', 'pending');
          helperPending += (withCount.count ?? 0);
        }
      }

      double hostGross = 0;
      double agencyComm = 0;
      for (var t in earnings) {
        final gross = (double.tryParse(t['gift_earnings']?.toString() ?? '0') ?? 0) + 
                     (double.tryParse(t['call_earnings']?.toString() ?? '0') ?? 0);
        double rate = double.tryParse(t['commission_rate']?.toString() ?? '0') ?? 0;
        if (isPayrollAgency && rate < 12) rate = 12;
        hostGross += gross;
        agencyComm += (gross * rate / 100).round();
      }

      Map<String, dynamic>? parent;
      if (stats['agency']?['parent_agency_id'] != null) {
        parent = await _api.getSupabase().from('agencies').select('*, owner:profiles(*)').eq('id', stats['agency']['parent_agency_id']).maybeSingle();
      }

      double withdrawnTotal = 0;
      for (var w in withdrawals) {
        if (['pending', 'processing', 'approved', 'completed'].contains(w['status'])) {
          withdrawnTotal += (double.tryParse(w['amount_beans']?.toString() ?? '0') ?? 0);
        }
      }

      final String agencyCode = stats['agency']?['agency_code'] ?? '';
      const String webBaseUrl = "https://merilive.com"; 
      final subAgentLink = "$webBaseUrl/become-sub-agent?ref=$agencyCode";
      final hostJoinLink = "$webBaseUrl/join-agency?code=$agencyCode";

      if (mounted) {
        setState(() {
          _agency = stats['agency'];
          _parentAgency = parent;
          _pendingHosts = List<Map<String, dynamic>>.from(stats['pending_hosts'] ?? []);
          _activeHosts = activeHosts;
          _finance = finance;
          _countryConfig = country;
          _isLevel5 = isPayrollAgency;
          _totalHostEarnings = hostGross;
          _totalCommission = agencyComm;
          _totalWithdrawn = withdrawnTotal;
          _ownerPersonalBeans = int.tryParse(profile['beans']?.toString() ?? '0') ?? 0;
          _subAgencyCount = stats['sub_agency_count'] ?? 0;
          _subAgentCount = stats['sub_agent_count'] ?? 0;
          _performanceHistory = List<Map<String, dynamic>>.from(stats['performance_history'] ?? []);
          _recentWithdrawals = withdrawals.take(10).toList();
          _pendingHelperRequests = helperPending;
          _subAgentLink = subAgentLink;
          _hostJoinLink = hostJoinLink;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Parity Dash Error: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.cyanAccent)));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildPremiumHeader(),
                _buildTabBar(),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildOverviewTab(),
                      _buildPerformanceTab(),
                      _buildTeamTab(),
                      _buildFinancialsTab(),
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

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.2), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.cyanAccent.withOpacity(0.3))),
        labelColor: Colors.cyanAccent,
        unselectedLabelColor: Colors.white38,
        labelStyle: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold),
        tabs: const [
          Tab(text: "OVERVIEW"),
          Tab(text: "PERFORMANCE"),
          Tab(text: "TEAM"),
          Tab(text: "FINANCIALS"),
        ],
      ),
    );
  }

  Widget _buildOverviewTab() {
    return RefreshIndicator(
      onRefresh: _loadData,
      color: Colors.cyanAccent,
      backgroundColor: const Color(0xFF1E293B),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        children: [
          if (_isLevel5) _buildSupervisorBanner(),
          _buildPayrollHelperWelcome(),
          const SizedBox(height: 24),
          _buildRequirementsCard(),
          const SizedBox(height: 24),
          _buildAgencyIdentityCard(),
          const SizedBox(height: 32),
          _buildFinancialSnapshot(simplified: true),
          const SizedBox(height: 40),
          _buildCommandCenter(),
          const SizedBox(height: 40),
          if (_pendingHosts.isNotEmpty) ...[
            _buildSectionHeader("PENDING HOST APPLICATIONS"),
            const SizedBox(height: 16),
            _buildPendingRequestsList(),
            const SizedBox(height: 32),
          ],
          const SizedBox(height: 120),
        ],
      ),
    );
  }

  Widget _buildPerformanceTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      children: [
        _buildPerformanceChart(),
        const SizedBox(height: 40),
        _buildSectionHeader("WEEKLY STATISTICS"),
        const SizedBox(height: 16),
        _buildPerformanceStatsGrid(),
      ],
    );
  }

  Widget _buildTeamTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      children: [
        _buildSectionHeader("ACTIVE HOSTS"),
        const SizedBox(height: 16),
        _buildActiveHostsList(),
        const SizedBox(height: 40),
        _buildRecruitmentSection(),
        const SizedBox(height: 32),
        _buildSectionHeader("RECRUITMENT & NETWORK"),
        const SizedBox(height: 16),
        _buildRecruitmentFlows(),
      ],
    );
  }

  Widget _buildFinancialsTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      children: [
        _buildFinancialSnapshot(simplified: false),
        const SizedBox(height: 40),
        _buildSectionHeader("RECENT WITHDRAWALS"),
        const SizedBox(height: 16),
        _buildWithdrawalHistoryList(),
        const SizedBox(height: 32),
        _buildSectionHeader("MANAGEMENT & INSIGHTS"),
        const SizedBox(height: 16),
        _buildManagementTools(),
      ],
    );
  }

  Widget _buildPremiumHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Agency Dashboard", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              Text("Master Copy • Global Nexus Control", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/agent-rank'),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), shape: BoxShape.circle, border: Border.all(color: Colors.amberAccent.withOpacity(0.2))),
              child: const Icon(LucideIcons.trophy, color: Colors.amberAccent, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPayrollHelperWelcome() {
    return FadeInDown(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.sparkles, color: Colors.cyanAccent, size: 24),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Payroll Helper Welcome", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  Text("Join the elite network and settle payrolls.", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10, height: 1.4)),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, color: Colors.white24, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildRequirementsCard() {
    final int hostCount = _agency?['total_hosts'] ?? 0;
    final double progress = (hostCount / 10).clamp(0.0, 1.0);
    final bool isMet = hostCount >= 10;

    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: isMet ? Colors.greenAccent.withOpacity(0.05) : Colors.amberAccent.withOpacity(0.05),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: (isMet ? Colors.greenAccent : Colors.amberAccent).withOpacity(0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(isMet ? LucideIcons.checkCircle2 : LucideIcons.alertTriangle, color: isMet ? Colors.greenAccent : Colors.amberAccent, size: 20),
                    const SizedBox(width: 12),
                    Text("HOST TARGET", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  ],
                ),
                Text("$hostCount/10", style: GoogleFonts.spaceMono(color: isMet ? Colors.greenAccent : Colors.amberAccent, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 20),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: LinearProgressIndicator(
                value: progress,
                backgroundColor: Colors.white.withOpacity(0.05),
                valueColor: AlwaysStoppedAnimation<Color>(isMet ? Colors.greenAccent : Colors.amberAccent),
                minHeight: 8,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSupervisorBanner() {
    return FadeInDown(
      child: Container(
        margin: const EdgeInsets.only(bottom: 32),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(40),
          boxShadow: [BoxShadow(color: Colors.cyan.withOpacity(0.3), blurRadius: 40, offset: const Offset(0, 10))],
          border: Border.all(color: Colors.white.withOpacity(0.2)),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(40),
          child: Stack(
            children: [
              Positioned(right: -20, top: -20, child: Icon(LucideIcons.shieldCheck, color: Colors.white.withOpacity(0.1), size: 120)),
              Padding(
                padding: const EdgeInsets.all(32),
                child: Row(
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
                          child: const Icon(LucideIcons.crown, color: Colors.white, size: 28),
                        ),
                        if (_pendingHelperRequests > 0)
                          Positioned(
                            right: -5, top: -5,
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                              child: Text("$_pendingHelperRequests", style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 24),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
                            child: Text("SUPERVISOR LEVEL", style: GoogleFonts.outfit(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 2)),
                          ),
                          const SizedBox(height: 8),
                          Text("Control Center", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pushNamed(context, '/level5-helper-dashboard'),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: const Icon(LucideIcons.arrowRight, color: Color(0xFF3B82F6), size: 20),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAgencyIdentityCard() {
    final String level = _agency?['level'] ?? 'A1';
    final Map<String, dynamic> levelStyles = {
      'A5': {'color': Colors.purpleAccent, 'name': 'LEGEND AGENT', 'icon': LucideIcons.crown, 'gradient': [const Color(0xFF8B5CF6), const Color(0xFFD946EF)]},
      'A4': {'color': Colors.amberAccent, 'name': 'ELITE AGENT', 'icon': LucideIcons.star, 'gradient': [const Color(0xFFFBBF24), const Color(0xFFF59E0B)]},
      'A3': {'color': Colors.blueAccent, 'name': 'PRO AGENT', 'icon': LucideIcons.zap, 'gradient': [const Color(0xFF3B82F6), const Color(0xFF2563EB)]},
      'A2': {'color': Colors.orangeAccent, 'name': 'RISING AGENT', 'icon': LucideIcons.flame, 'gradient': [const Color(0xFFF97316), const Color(0xFFEA580C)]},
      'A1': {'color': Colors.slateAccent, 'name': 'STARTER AGENT', 'icon': LucideIcons.award, 'gradient': [const Color(0xFF94A3B8), const Color(0xFF64748B)]},
    };
    final style = levelStyles[level] ?? levelStyles['A1'];
    final List<Color> gradient = style['gradient'];

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [gradient[0].withOpacity(0.1), Colors.white.withOpacity(0.01)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(40),
        border: Border.all(color: gradient[0].withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 60, height: 60,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [gradient[0], gradient[1]]),
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Icon(style['icon'], color: Colors.white, size: 32),
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(_agency?['name'] ?? 'Agency Nexus', style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                                child: Text(style['name'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(4)),
                                child: Text("ID: ${_agency?['agency_code'] ?? '---'}", style: GoogleFonts.spaceMono(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                              const SizedBox(width: 8),
                              const Icon(LucideIcons.percent, color: Colors.white70, size: 10),
                              const SizedBox(width: 2),
                              Text("${_agency?['commission_rate'] ?? 0}%", style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 10, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (_parentAgency != null)
                      IconButton(onPressed: () {}, icon: const Icon(LucideIcons.shield, color: Colors.white30, size: 18)),
                  ],
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.black.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [const Icon(LucideIcons.gem, color: Colors.white30, size: 10), const SizedBox(width: 4), const Text("DIAMONDS", style: TextStyle(color: Colors.white30, fontSize: 8, fontWeight: FontWeight.bold))]),
                            const SizedBox(height: 4),
                            Text(_api.formatNumber(_agency?['diamond_balance'] ?? 0), style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.black.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [const Icon(LucideIcons.coins, color: Colors.white30, size: 10), const SizedBox(width: 4), const Text("BEANS", style: TextStyle(color: Colors.white30, fontSize: 8, fontWeight: FontWeight.bold))]),
                            const SizedBox(height: 4),
                            Text(_api.formatNumber(_agency?['wallet_balance'] ?? 0), style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: const BorderRadius.vertical(bottom: Radius.circular(40))),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildSimpleStat(LucideIcons.users, "${_agency?['total_hosts'] ?? 0}", "HOSTS"),
                _buildSimpleStat(LucideIcons.userPlus, "$_subAgencyCount", "AGENCIES"),
                _buildSimpleStat(LucideIcons.users2, "$_subAgentCount", "PARTNERS"),
                _buildSimpleStat(LucideIcons.gem, _api.formatNumber(_ownerPersonalBeans), "PERSONAL"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFinancialSnapshot({required bool simplified}) {
    final int balance = _agency?['wallet_balance'] ?? 0;
    final int beansPerUsd = _finance['beans_per_usd'] ?? 9000;
    final double usdValue = balance / beansPerUsd;
    final double localRate = _countryConfig?['rate_to_usd'] ?? 1.0;
    final String currencyCode = _countryConfig?['currency_code'] ?? "USD";
    final double localValue = usdValue * localRate;

    return Column(
      children: [
        Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF4F46E5)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(40),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text("AGENCY REVENUE", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
                        Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(10)), child: Text(currencyCode, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900))),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(NumberFormat('#,###').format(balance), style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w900)),
                        const SizedBox(width: 8),
                        Text("BEANS", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.5), fontSize: 14, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text("≈ ${NumberFormat.simpleCurrency(name: currencyCode).format(localValue)} Settled Value", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 16, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.15), borderRadius: const BorderRadius.vertical(bottom: Radius.circular(40))),
                child: Row(
                  children: [
                    Expanded(child: _buildActionBtn(LucideIcons.wallet, "Withdraw", () => Navigator.pushNamed(context, '/agency-withdrawal', arguments: _agency))),
                    const SizedBox(width: 16),
                    Expanded(child: _buildActionBtn(LucideIcons.history, "History", () => Navigator.pushNamed(context, '/agency-history'))),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (!simplified) ...[
          const SizedBox(height: 32),
          _buildFinancialBreakdownChart(),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _buildMiniFinancialCard("WITHDRAWN", _api.formatNumber(_totalWithdrawn), const Color(0xFF10B981))),
            const SizedBox(width: 16),
            Expanded(child: _buildMiniFinancialCard("COMMISSION", _api.formatNumber(_totalCommission), const Color(0xFFF59E0B))),
          ],
        ),
      ],
    );
  }

  Widget _buildFinancialBreakdownChart() {
    final int balance = _agency?['wallet_balance'] ?? 0;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("FINANCIAL BREAKDOWN", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          SizedBox(
            height: 160,
            child: PieChart(PieChartData(sectionsSpace: 4, centerSpaceRadius: 40, sections: [
              PieChartSectionData(color: const Color(0xFF6366F1), value: balance.toDouble(), title: '', radius: 16),
              PieChartSectionData(color: const Color(0xFF10B981), value: _totalWithdrawn, title: '', radius: 16),
              PieChartSectionData(color: const Color(0xFFF59E0B), value: _totalCommission, title: '', radius: 16),
            ])),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniFinancialCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.3), fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1)),
          const SizedBox(height: 8),
          Text(value, style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildCommandCenter() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 4,
      mainAxisSpacing: 24,
      crossAxisSpacing: 16,
      childAspectRatio: 0.8,
      children: [
        _build3DActionItem("assets/3d/wallet.png", "Wallet", Colors.cyanAccent, () => _tabController.animateTo(3)),
        _build3DActionItem("assets/3d/hosts.png", "Hosts", Colors.pinkAccent, () => _tabController.animateTo(2)),
        _build3DActionItem("assets/3d/ranking.png", "Ranking", Colors.amberAccent, () => Navigator.pushNamed(context, '/agent-rank')),
        _build3DActionItem("assets/3d/helper.png", "Helper", Colors.blueAccent, () => Navigator.pushNamed(context, '/level5-helper-dashboard')),
        _build3DActionItem("assets/3d/exchange.png", "Exchange", Colors.orangeAccent, () => Navigator.pushNamed(context, '/agency-coin-exchange')),
        _build3DActionItem("assets/3d/policy.png", "Policy", Colors.greenAccent, () => Navigator.pushNamed(context, '/agency-policy')),
        _build3DActionItem("assets/3d/history.png", "History", Colors.purpleAccent, () => Navigator.pushNamed(context, '/agency-history')),
        _build3DActionItem("assets/3d/stats.png", "Stats", Colors.indigoAccent, () => _tabController.animateTo(1)),
      ],
    );
  }

  Widget _build3DActionItem(String assetPath, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Image.asset(assetPath, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Icon(LucideIcons.box, color: color)),
            ),
          ),
          const SizedBox(height: 8),
          Text(label, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.5), fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }


  Widget _buildActiveHostsList() {
    if (_activeHosts.isEmpty) return const Center(child: Text("No active hosts", style: TextStyle(color: Colors.white24)));
    return Column(
      children: _activeHosts.map((host) {
        final p = host['profile'];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24)),
          child: Row(
            children: [
              CircleAvatar(backgroundImage: NetworkImage(p?['avatar_url'] ?? '')),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(p?['display_name'] ?? 'Host', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), Text("UID: ${p?['app_uid'] ?? ''}", style: const TextStyle(color: Colors.white24, fontSize: 10))])),
              Text(_api.formatNumber(p?['beans'] ?? 0), style: GoogleFonts.spaceMono(color: Colors.cyanAccent, fontWeight: FontWeight.bold)),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildWithdrawalHistoryList() {
    if (_recentWithdrawals.isEmpty) return const Center(child: Text("No recent withdrawals", style: TextStyle(color: Colors.white24)));
    return Column(
      children: _recentWithdrawals.map((w) {
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24)),
          child: Row(
            children: [
              const Icon(LucideIcons.arrowDownLeft, color: Colors.greenAccent, size: 16),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text("${_api.formatNumber(w['amount_beans'])} Beans", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), Text(DateFormat.yMMMd().format(DateTime.parse(w['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 10))])),
              Text(w['status'].toString().toUpperCase(), style: GoogleFonts.outfit(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildPerformanceStatsGrid() {
    final last = _performanceHistory.isNotEmpty ? _performanceHistory.first : {};
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 16,
      crossAxisSpacing: 16,
      childAspectRatio: 1.5,
      children: [
        _buildStatCard("DAILY INCOME", _api.formatNumber(last['total_beans'] ?? 0), LucideIcons.trendingUp, Colors.cyanAccent),
        _buildStatCard("NEW HOSTS", "${last['new_hosts'] ?? 0}", LucideIcons.userPlus, Colors.orangeAccent),
      ],
    );
  }

  Widget _buildStatCard(String label, String val, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [Icon(icon, color: color, size: 16), const SizedBox(height: 8), Text(val, style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)), Text(label, style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold))]),
    );
  }

  Widget _buildRecruitmentSection() {
    return Row(
      children: [
        Expanded(child: _buildRecruitCard("SUB-AGENT LINK", _subAgentLink, Colors.purpleAccent)),
        const SizedBox(width: 16),
        Expanded(child: _buildRecruitCard("HOST JOIN LINK", _hostJoinLink, Colors.blueAccent)),
      ],
    );
  }

  Widget _buildRecruitCard(String title, String link, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)), const SizedBox(height: 12), Row(children: [Expanded(child: Text(link, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white24, fontSize: 10))), IconButton(onPressed: () => Share.share(link), icon: const Icon(LucideIcons.share2, color: Colors.white, size: 14))])]),
    );
  }

  Widget _buildRecruitmentFlows() {
    return Column(children: [_buildFlowTile(LucideIcons.search, "Agency Form", "Apply for licenses"), _buildFlowTile(LucideIcons.network, "Sub Agency", "Manage network")]);
  }

  Widget _buildFlowTile(IconData icon, String title, String sub) {
    return ListTile(leading: Icon(icon, color: Colors.cyanAccent), title: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), subtitle: Text(sub, style: const TextStyle(color: Colors.white24, fontSize: 10)), trailing: const Icon(LucideIcons.chevronRight, color: Colors.white10));
  }

  Widget _buildManagementTools() {
    return Column(children: [_buildToolTile(LucideIcons.fileText, "Guide", "Master recruitment"), _buildToolTile(LucideIcons.mail, "Referral", "Invite partners")]);
  }

  Widget _buildToolTile(IconData icon, String title, String sub) {
    return ListTile(leading: Icon(icon, color: Colors.white24), title: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), subtitle: Text(sub, style: const TextStyle(color: Colors.white24, fontSize: 10)), trailing: const Icon(LucideIcons.chevronRight, color: Colors.white10));
  }

  Widget _buildPendingRequestsList() {
    return Column(
      children: _pendingHosts.map((h) {
        final p = h['host'];
        return ListTile(leading: CircleAvatar(backgroundImage: NetworkImage(p?['avatar_url'] ?? '')), title: Text(p?['display_name'] ?? 'Host', style: const TextStyle(color: Colors.white)), trailing: Row(mainAxisSize: MainAxisSize.min, children: [IconButton(icon: const Icon(LucideIcons.check, color: Colors.greenAccent), onPressed: () {}), IconButton(icon: const Icon(LucideIcons.x, color: Colors.redAccent), onPressed: () {})]));
      }).toList(),
    );
  }

  Widget _buildPerformanceChart() {
    final spots = _performanceHistory.asMap().entries.map((e) => FlSpot(e.key.toDouble(), double.tryParse(e.value['total_beans'].toString()) ?? 0)).toList();
    return Container(height: 200, child: LineChart(LineChartData(gridData: const FlGridData(show: false), titlesData: const FlTitlesData(show: false), borderData: FlBorderData(show: false), lineBarsData: [LineChartBarData(spots: spots, isCurved: true, color: Colors.indigoAccent, barWidth: 4, dotData: const FlDotData(show: false), belowBarData: BarAreaData(show: true, gradient: LinearGradient(colors: [Colors.indigoAccent.withOpacity(0.3), Colors.transparent], begin: Alignment.topCenter, end: Alignment.bottomCenter)))])));
  }

  Widget _buildActionBtn(IconData icon, String label, VoidCallback onTap) {
    return ElevatedButton.icon(onPressed: onTap, icon: Icon(icon, size: 16), label: Text(label), style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.1), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
  }

  Widget _buildSimpleStat(IconData icon, String val, String label) {
    return Column(children: [Icon(icon, color: Colors.white24, size: 16), const SizedBox(height: 4), Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8))]);
  }

  Widget _buildSectionHeader(String title) {
    return Padding(padding: const EdgeInsets.only(bottom: 16), child: Text(title, style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)));
  }
}

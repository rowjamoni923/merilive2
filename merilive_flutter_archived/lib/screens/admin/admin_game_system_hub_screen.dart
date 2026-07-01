import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminGameSystemHubScreen extends StatefulWidget {
  const AdminGameSystemHubScreen({super.key});

  @override
  State<AdminGameSystemHubScreen> createState() => _AdminGameSystemHubScreenState();
}

class _AdminGameSystemHubScreenState extends State<AdminGameSystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _games = [];
  Map<String, dynamic> _stats = {'activeGames': 0, 'providers': 0, 'serverStatus': 'ONLINE'};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    await Future.wait([
      _loadGames(),
      _loadLeaderboard(),
      _loadProviders(),
      _loadServerSettings(),
    ]);
    setState(() => _isLoading = false);
  }

  Future<void> _loadGames() async {
    try {
      final res = await _api.getSupabase().from('game_settings').select('*').order('display_order', ascending: true);
      _games = List<Map<String, dynamic>>.from(res);
      _stats['activeGames'] = _games.where((g) => g['is_active'] == true).length;
    } catch (e) { debugPrint("Error loading games: $e"); }
  }

  List<Map<String, dynamic>> _leaderboard = [];
  Future<void> _loadLeaderboard() async {
    try {
      final res = await _api.getSupabase().from('game_transactions').select('user_id, amount, transaction_type, profiles(display_name, avatar_url)').order('created_at', ascending: false).limit(20);
      _leaderboard = List<Map<String, dynamic>>.from(res);
    } catch (e) { debugPrint("Error loading leaderboard: $e"); }
  }

  List<Map<String, dynamic>> _providers = [];
  Future<void> _loadProviders() async {
    try {
      final res = await _api.getSupabase().from('game_providers').select('*').order('created_at', ascending: false);
      _providers = List<Map<String, dynamic>>.from(res);
      _stats['providers'] = _providers.length;
    } catch (e) { debugPrint("Error loading providers: $e"); }
  }

  Map<String, dynamic>? _serverSettings;
  Future<void> _loadServerSettings() async {
    try {
      final res = await _api.getSupabase().from('game_server_settings').select('*').maybeSingle();
      _serverSettings = res;
      if (_serverSettings != null) {
        _stats['serverStatus'] = _serverSettings!['maintenance_mode'] == true ? 'MAINTENANCE' : (_serverSettings!['is_active'] == true ? 'ONLINE' : 'OFFLINE');
      }
    } catch (e) { debugPrint("Error loading server settings: $e"); }
  }

  Future<void> _updateServerSetting(String field, dynamic value) async {
    try {
      if (_serverSettings == null) return;
      await _api.getSupabase().from('game_server_settings').update({field: value}).eq('id', _serverSettings!['id']);
      _loadServerSettings();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Server $field updated to $value")));
    } catch (e) { debugPrint("Error updating server setting: $e"); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          _buildStatsOverview(),
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildGameSettings(),
                _buildLeaderboard(),
                _buildProviders(),
                _buildServerControl(),
              ],
            ),
          ),
        ],
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
          colors: [Colors.purpleAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purpleAccent, Colors.pinkAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.gamepad2, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("GAME SYSTEM MANAGEMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Manage all native games, third-party providers, and real-time server controls", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          _statCard("ACTIVE GAMES", _stats['activeGames'].toString(), LucideIcons.settings2, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("PROVIDERS", _stats['providers'].toString(), LucideIcons.globe, Colors.greenAccent),
          const SizedBox(width: 16),
          _statCard("SERVER STATUS", _stats['serverStatus'], LucideIcons.server, Colors.orangeAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.all(40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blueAccent, Colors.purpleAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "SETTINGS"), Tab(text: "LEADERBOARD"), Tab(text: "PROVIDERS"), Tab(text: "SERVER")],
      ),
    );
  }

  Widget _buildGameSettings() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _games.length,
      itemBuilder: (context, index) {
        final g = _games[index];
        final bool isActive = g['is_active'] ?? false;
        final color = Color(int.parse((g['game_color'] ?? "0xFF6366F1").replaceAll("from-", "0xFF").replaceAll("to-", "0xFF").split(" ")[0]));

        return FadeInUp(
          delay: Duration(milliseconds: 10 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? color.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                  child: Center(child: Text(g['game_emoji'] ?? "🎮", style: const TextStyle(fontSize: 28))),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(g['game_name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          const SizedBox(width: 12),
                          _badge(g['category']?.toString().toUpperCase() ?? "CLASSIC", color.withOpacity(0.1), color),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(g['description'] ?? "No description", style: const TextStyle(color: Colors.white24, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          _miniStat(LucideIcons.target, "WIN ${g['win_probability']}%"),
                          const SizedBox(width: 16),
                          _miniStat(LucideIcons.trendingUp, "${g['max_multiplier']}x MAX"),
                        ],
                      ),
                    ],
                  ),
                ),
                Switch(value: isActive, onChanged: (v) {}, activeColor: Colors.emeraldAccent),
                const SizedBox(width: 20),
                _iconBtn(LucideIcons.edit3, Colors.white10, () {}),
                const SizedBox(width: 12),
                _iconBtn(LucideIcons.trash2, Colors.redAccent.withOpacity(0.1), () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _badge(String label, Color bg, Color text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: TextStyle(color: text, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Widget _miniStat(IconData icon, String label) {
    return Row(
      children: [
        Icon(icon, color: Colors.white10, size: 12),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _iconBtn(IconData icon, Color bg, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: Colors.white, size: 16),
      ),
    );
  }

  Widget _buildLeaderboard() {
    if (_leaderboard.isEmpty) return const Center(child: Text("No winners found", style: TextStyle(color: Colors.white24)));
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _leaderboard.length,
      itemBuilder: (context, index) {
        final lb = _leaderboard[index];
        final profile = lb['profiles'] ?? {};
        final isWin = lb['transaction_type'] == 'win' || lb['transaction_type'] == 'jackpot';
        
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              CircleAvatar(backgroundImage: profile['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(profile['avatar_url'], bucket: 'avatars')) : null),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(profile['display_name'] ?? 'Unknown User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text(lb['transaction_type'].toString().toUpperCase(), style: TextStyle(color: isWin ? Colors.greenAccent : Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                ]),
              ),
              Text("${lb['amount']} 💎", style: GoogleFonts.outfit(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildProviders() {
    if (_providers.isEmpty) return const Center(child: Text("No providers configured", style: TextStyle(color: Colors.white24)));
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _providers.length,
      itemBuilder: (context, index) {
        final p = _providers[index];
        final bool isActive = p['is_active'] ?? false;
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: isActive ? Colors.blueAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Container(width: 48, height: 48, decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: const Icon(LucideIcons.globe, color: Colors.blueAccent)),
              const SizedBox(width: 20),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['provider_name'] ?? 'Provider', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text(p['provider_id'] ?? '', style: const TextStyle(color: Colors.white24, fontSize: 11)),
              ])),
              Switch(value: isActive, onChanged: (v) {}, activeColor: Colors.blueAccent),
            ],
          ),
        );
      },
    );
  }

  Widget _buildServerControl() {
    if (_serverSettings == null) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));
    final bool isActive = _serverSettings!['is_active'] ?? false;
    final bool isMaintenance = _serverSettings!['maintenance_mode'] ?? false;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              children: [
                Icon(LucideIcons.server, size: 64, color: isMaintenance ? Colors.orangeAccent : (isActive ? Colors.emeraldAccent : Colors.redAccent)),
                const SizedBox(height: 24),
                Text(_serverSettings!['server_name'] ?? 'GAME SERVER', style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                Text(isMaintenance ? "MAINTENANCE MODE" : (isActive ? "SYSTEMS OPERATIONAL" : "SERVER OFFLINE"), style: TextStyle(color: isMaintenance ? Colors.orangeAccent : (isActive ? Colors.emeraldAccent : Colors.redAccent), fontWeight: FontWeight.bold, letterSpacing: 2)),
                const SizedBox(height: 40),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _serverActionBtn("STOP", LucideIcons.pause, Colors.redAccent, isActive && !isMaintenance, () => _updateServerSetting('is_active', false)),
                    const SizedBox(width: 20),
                    _serverActionBtn("START", LucideIcons.play, Colors.emeraldAccent, !isActive, () => _updateServerSetting('is_active', true)),
                    const SizedBox(width: 20),
                    _serverActionBtn("MAINTENANCE", LucideIcons.tool, Colors.orangeAccent, !isMaintenance, () => _updateServerSetting('maintenance_mode', true)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _settingTile("Global House Edge", "${_serverSettings!['global_house_edge']}%", LucideIcons.percent),
          _settingTile("Max Payout", "${_serverSettings!['max_total_payout_per_round']} 💎", LucideIcons.coins),
          _settingTile("Auto Process", _serverSettings!['auto_process_enabled'] == true ? "ENABLED" : "DISABLED", LucideIcons.zap),
        ],
      ),
    );
  }

  Widget _serverActionBtn(String label, IconData icon, Color color, bool enabled, VoidCallback onTap) {
    return Opacity(
      opacity: enabled ? 1 : 0.3,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: Column(
          children: [
            Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle, border: Border.all(color: color.withOpacity(0.2))), child: Icon(icon, color: color)),
            const SizedBox(height: 12),
            Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _settingTile(String label, String value, IconData icon) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white24, size: 18),
          const SizedBox(width: 16),
          Text(label, style: const TextStyle(color: Colors.white70)),
          const Spacer(),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

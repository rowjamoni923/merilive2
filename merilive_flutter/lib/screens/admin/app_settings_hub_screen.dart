import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AppSettingsHubScreen extends StatefulWidget {
  const AppSettingsHubScreen({super.key});

  @override
  State<AppSettingsHubScreen> createState() => _AppSettingsHubScreenState();
}

class _AppSettingsHubScreenState extends State<AppSettingsHubScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  bool _isSaving = false;
  Map<String, dynamic> _settings = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('app_settings').select('*');
      
      final Map<String, dynamic> settingsMap = {};
      for (var item in res) {
        settingsMap[item['setting_key']] = item['setting_value'];
      }
      
      setState(() {
        _settings = settingsMap;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading settings: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSetting(String key, dynamic value) async {
    setState(() => _isSaving = true);
    try {
      final supa = _api.getSupabase();
      await supa.from('app_settings').upsert({
        'setting_key': key,
        'setting_value': value,
        'updated_at': DateTime.now().toIso8601String()
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Setting '$key' updated successfully! ✅")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error saving '$key': $e")));
    } finally {
      setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildTabs(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildSystemTab(),
                    _buildFinanceTab(),
                    _buildPartyTab(),
                  ],
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("APP LIFECYCLE HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Global platform configuration, maintenance toggles, and fee governance", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadSettings,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("RELOAD CONFIG"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: const Color(0xFF6366F1),
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
        tabs: const [Tab(text: "SYSTEM & SECURITY"), Tab(text: "FINANCE & FEES"), Tab(text: "PARTY LIMITS")],
      ),
    );
  }

  Widget _buildSystemTab() {
    final maintenance = _settings['maintenance_mode'] ?? {'enabled': false, 'message': ''};
    final auth2fa = _settings['admin_2fa'] ?? {'enabled': true};

    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          _buildSettingCard(
            "Maintenance Mode",
            "Toggling this will prevent all users from accessing the platform",
            LucideIcons.shieldAlert,
            Colors.redAccent,
            Switch(
              value: maintenance['enabled'],
              activeColor: Colors.redAccent,
              onChanged: (v) {
                maintenance['enabled'] = v;
                _saveSetting('maintenance_mode', maintenance);
                setState(() {});
              },
            ),
          ),
          const SizedBox(height: 16),
          _buildSettingCard(
            "Two-Step Verification",
            "Enforces Email OTP during the login process for enhanced security",
            LucideIcons.lock,
            Colors.blueAccent,
            Switch(
              value: auth2fa['enabled'],
              activeColor: Colors.blueAccent,
              onChanged: (v) {
                auth2fa['enabled'] = v;
                _saveSetting('admin_2fa', auth2fa);
                setState(() {});
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFinanceTab() {
    final withdrawal = _settings['withdrawal_settings'] ?? {'coins_to_dollar_rate': 10000, 'min_withdrawal': 10000};
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          _buildSettingCard(
            "Exchange Rate (Beans per \$1)",
            "Sets the global conversion rate for agency Bean-to-USD settlements",
            LucideIcons.trendingUp,
            Colors.greenAccent,
            Text("${withdrawal['coins_to_dollar_rate']} B", style: GoogleFonts.robotoMono(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 16),
          _buildSettingCard(
            "Minimum Withdrawal",
            "Threshold required for agencies to initiate a settlement request",
            LucideIcons.wallet,
            Colors.amberAccent,
            Text("${withdrawal['min_withdrawal']} B", style: GoogleFonts.robotoMono(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildPartyTab() {
    final limits = _settings['party_room_limits'] ?? {'max_video_participants': 4, 'max_audio_participants': 12};

    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          _buildSettingCard(
            "Video Stream Limit",
            "Maximum concurrent video streams allowed in a single party room",
            LucideIcons.video,
            Colors.purpleAccent,
            Text("${limits['max_video_participants']} Slots", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 16),
          _buildSettingCard(
            "Audio Speaker Limit",
            "Maximum concurrent audio speakers allowed in a single party room",
            LucideIcons.mic,
            Colors.cyanAccent,
            Text("${limits['max_audio_participants']} Slots", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingCard(String title, String desc, IconData icon, Color color, Widget action) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: color, size: 20)),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Text(desc, style: const TextStyle(color: Colors.white24, fontSize: 12)),
              ],
            ),
          ),
          action,
        ],
      ),
    );
  }
}

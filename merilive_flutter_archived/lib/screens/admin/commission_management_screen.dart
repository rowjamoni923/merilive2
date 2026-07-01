import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class CommissionManagementScreen extends StatefulWidget {
  const CommissionManagementScreen({super.key});

  @override
  State<CommissionManagementScreen> createState() => _CommissionManagementScreenState();
}

class _CommissionManagementScreenState extends State<CommissionManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  Map<String, dynamic> _settings = {};
  
  // Controllers for various settings
  final TextEditingController _defaultCallRate = TextEditingController();
  final TextEditingController _hostCallComm = TextEditingController();
  final TextEditingController _hostGiftComm = TextEditingController();
  final TextEditingController _agencyBaseComm = TextEditingController();
  final TextEditingController _beansToDollar = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('app_settings').select('*');
      
      Map<String, dynamic> settingsMap = {};
      for (var item in res) {
        settingsMap[item['setting_key']] = item['setting_value'];
      }

      setState(() {
        _settings = settingsMap;
        
        final callRates = settingsMap['call_rates'] ?? {};
        _defaultCallRate.text = (callRates['default_rate'] ?? 60).toString();
        _hostCallComm.text = (callRates['host_commission_percent'] ?? 40).toString();
        
        final giftComm = settingsMap['gift_commission'] ?? {};
        _hostGiftComm.text = (giftComm['host_percent'] ?? 40).toString();
        
        final agencyComm = settingsMap['agency_commission'] ?? {};
        _agencyBaseComm.text = (agencyComm['agency_percent'] ?? 2).toString();
        _beansToDollar.text = (agencyComm['coins_to_dollar_rate'] ?? 10000).toString();
        
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading commissions: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveGroup(String key, Map<String, dynamic> value) async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      await supa.from('app_settings').update({
        'setting_value': value,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('setting_key', key);
      
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$key updated successfully")));
      _loadSettings();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));

    return Container(
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
                _buildCallSettings(),
                _buildGiftSettings(),
                _buildAgencySettings(),
                _buildPartySettings(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("COMMISSION GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
          const Text("Manage platform revenue shares, call rates, and agency payout structures", style: TextStyle(color: Colors.white38, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "Call Rates"),
          Tab(text: "Gift Revenue"),
          Tab(text: "Agency Tiers"),
          Tab(text: "Party Rooms"),
        ],
      ),
    );
  }

  Widget _buildCallSettings() {
    return _buildFormWrapper(
      icon: LucideIcons.phone,
      title: "CALL RATE CONFIGURATION",
      children: [
        _buildTextField("Default Beans Per Minute", _defaultCallRate, "e.g. 60"),
        const SizedBox(height: 24),
        _buildTextField("Host Commission (%)", _hostCallComm, "e.g. 40"),
        const SizedBox(height: 48),
        _buildSaveBtn(() {
          _saveGroup('call_rates', {
            ...(_settings['call_rates'] ?? {}),
            'default_rate': int.parse(_defaultCallRate.text),
            'host_commission_percent': int.parse(_hostCallComm.text),
          });
        }),
      ],
    );
  }

  Widget _buildGiftSettings() {
    return _buildFormWrapper(
      icon: LucideIcons.gift,
      title: "GIFT REVENUE SHARING",
      children: [
        _buildTextField("Host Gift Commission (%)", _hostGiftComm, "e.g. 40"),
        const SizedBox(height: 48),
        _buildSaveBtn(() {
          _saveGroup('gift_commission', {
            'host_percent': int.parse(_hostGiftComm.text),
          });
        }),
      ],
    );
  }

  Widget _buildAgencySettings() {
    return _buildFormWrapper(
      icon: LucideIcons.building2,
      title: "AGENCY PAYOUT STRUCTURE",
      children: [
        _buildTextField("Base Agency Commission (%)", _agencyBaseComm, "e.g. 2"),
        const SizedBox(height: 24),
        _buildTextField("Beans to Dollar Rate (1 USD = ?)", _beansToDollar, "e.g. 10000"),
        const SizedBox(height: 48),
        _buildSaveBtn(() {
          _saveGroup('agency_commission', {
            ...(_settings['agency_commission'] ?? {}),
            'agency_percent': int.parse(_agencyBaseComm.text),
            'coins_to_dollar_rate': int.parse(_beansToDollar.text),
          });
        }),
      ],
    );
  }

  Widget _buildPartySettings() {
    final partyDefaults = _settings['party_room_defaults'] ?? {};
    return _buildFormWrapper(
      icon: LucideIcons.partyPopper,
      title: "PARTY ROOM DEFAULTS",
      children: [
        Text("Max Video Participants: ${partyDefaults['max_video_participants'] ?? 4}", style: const TextStyle(color: Colors.white70)),
        const SizedBox(height: 12),
        Text("Max Audio Participants: ${partyDefaults['max_audio_participants'] ?? 12}", style: const TextStyle(color: Colors.white70)),
        const SizedBox(height: 24),
        const Text("Manage these detailed parameters in the 'Game System' module", style: TextStyle(color: Colors.white24, fontSize: 11)),
      ],
    );
  }

  Widget _buildFormWrapper({required IconData icon, required String title, required List<Widget> children}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: FadeInUp(
        child: Container(
          padding: const EdgeInsets.all(40),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Icon(icon, color: const Color(0xFF6366F1), size: 20),
                const SizedBox(width: 16),
                Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
              ]),
              const SizedBox(height: 40),
              ...children,
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, String hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
          child: TextFormField(
            controller: controller,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            keyboardType: TextInputType.number,
            decoration: InputDecoration(hintText: hint, hintStyle: const TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14)),
          ),
        ),
      ],
    );
  }

  Widget _buildSaveBtn(VoidCallback onTap) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
        child: const Text("SAVE CHANGES", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

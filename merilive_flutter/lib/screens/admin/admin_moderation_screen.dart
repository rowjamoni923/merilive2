import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminModerationScreen extends StatefulWidget {
  const AdminModerationScreen({super.key});

  @override
  State<AdminModerationScreen> createState() => _AdminModerationScreenState();
}

class _AdminModerationScreenState extends State<AdminModerationScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _logs = [];
  String _filterType = "all";
  
  Map<String, dynamic> _settings = {
    'phone_detection_enabled': true,
    'auto_ban_phone_threshold': 3,
    'profile_slideshow_interval': 5,
    'max_poster_images': 5
  };

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Load Settings
      final settingsRes = await supa.from("app_settings").select("setting_key, setting_value");
      if (settingsRes != null) {
        for (var item in (settingsRes as List)) {
          final key = item['setting_key'];
          final val = item['setting_value'];
          if (key == 'phone_detection_enabled') {
            _settings[key] = val == 'true';
          } else if (_settings.containsKey(key)) {
            _settings[key] = int.tryParse(val.toString()) ?? _settings[key];
          }
        }
      }

      // Load Logs
      var query = supa.from("chat_moderation_logs").select("*, profiles(display_name, avatar_url, app_uid, is_blocked)");
      
      if (_filterType == "phone_number") {
        query = query.eq("violation_type", "phone_number");
      } else if (_filterType == "auto_ban") {
        query = query.eq("action_taken", "auto_ban");
      }

      final logsRes = await query.order("created_at", ascending: false).limit(50);
      
      setState(() {
        _logs = List<Map<String, dynamic>>.from(logsRes);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading moderation data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleUnban(String userId) async {
    try {
      final supa = _api.getSupabase();
      await supa.rpc("admin_block_user", params: {
        '_user_id': userId,
        '_block': false,
        '_reason': null,
      });
      await supa.from("profiles").update({'phone_violation_count': 0}).eq('id', userId);
      _loadData();
    } catch (e) {
      debugPrint("Error unbanning: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildStatsStrip(),
          const SizedBox(height: 24),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.redAccent))
              : _buildLogsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(48),
      margin: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFF97316)]),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.shield, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("MODERATION MANAGEMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("AI phone detection, auto-ban systems, and violation audit", style: TextStyle(color: Colors.white70)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () => _showSettings(),
            icon: const Icon(LucideIcons.settings),
            label: const Text("DETECTION SETTINGS"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.2), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsStrip() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _statBox("TOTAL LOGS", _logs.length.toString(), LucideIcons.alertTriangle, Colors.redAccent),
          const SizedBox(width: 16),
          _statBox("AUTO-BANS", _logs.where((l) => l['action_taken'] == 'auto_ban').length.toString(), LucideIcons.ban, Colors.orangeAccent),
          const SizedBox(width: 16),
          _statBox("AI DETECTION", _settings['phone_detection_enabled'] ? "ACTIVE" : "DISABLED", LucideIcons.shieldCheck, Colors.greenAccent),
          const Spacer(),
          _filterDropdown(),
        ],
      ),
    );
  }

  Widget _statBox(String label, String val, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(val, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
              Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _filterDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
      child: DropdownButton<String>(
        value: _filterType,
        dropdownColor: const Color(0xFF1E293B),
        underline: const SizedBox(),
        items: const [
          DropdownMenuItem(value: "all", child: Text("All Violations", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "phone_number", child: Text("Phone Detection", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "auto_ban", child: Text("Auto-Bans", style: TextStyle(color: Colors.white, fontSize: 12))),
        ],
        onChanged: (v) {
          setState(() => _filterType = v!);
          _loadData();
        },
      ),
    );
  }

  Widget _buildLogsList() {
    if (_logs.isEmpty) return const Center(child: Text("No moderation logs found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        final profile = log['profiles'] ?? {};
        final bool isBanned = profile['is_blocked'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                CircleAvatar(backgroundImage: NetworkImage(profile['avatar_url'] ?? ''), radius: 24),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(profile['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("ID: ${profile['app_uid'] ?? '-'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.orangeAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(log['violation_type'].toString().toUpperCase(), style: const TextStyle(color: Colors.orangeAccent, fontSize: 9, fontWeight: FontWeight.bold))),
                      const SizedBox(height: 4),
                      Text(log['detected_content'] ?? 'No content info', style: const TextStyle(color: Colors.white70, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(DateFormat('dd MMM, hh:mm a').format(DateTime.parse(log['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    const SizedBox(height: 8),
                    isBanned 
                      ? TextButton.icon(onPressed: () => _handleUnban(log['user_id']), icon: const Icon(LucideIcons.checkCircle, size: 14, color: Colors.greenAccent), label: const Text("UNBAN USER", style: TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)))
                      : Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: const Text("WARNING SENT", style: TextStyle(color: Colors.redAccent, fontSize: 9, fontWeight: FontWeight.bold))),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showSettings() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text("Moderation Settings", style: TextStyle(color: Colors.white)),
        content: StatefulBuilder(builder: (context, setDialogState) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SwitchListTile(title: const Text("AI Phone Detection", style: TextStyle(color: Colors.white70, fontSize: 14)), value: _settings['phone_detection_enabled'], onChanged: (v) => setDialogState(() => _settings['phone_detection_enabled'] = v)),
              _settingInput("Auto-Ban Threshold", 'auto_ban_phone_threshold'),
              _settingInput("Slideshow Interval", 'profile_slideshow_interval'),
            ],
          );
        }),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL")),
          ElevatedButton(onPressed: () async {
            // Save Settings Logic
            Navigator.pop(context);
            _loadData();
          }, child: const Text("SAVE SETTINGS")),
        ],
      ),
    );
  }

  Widget _settingInput(String label, String key) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 14)),
          SizedBox(width: 60, height: 40, child: TextField(style: const TextStyle(color: Colors.white), decoration: const InputDecoration(border: OutlineInputBorder()), controller: TextEditingController(text: _settings[key].toString()), keyboardType: TextInputType.number, onSubmitted: (v) => _settings[key] = int.parse(v))),
        ],
      ),
    );
  }
}

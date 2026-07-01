import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../services/admin_controller_service.dart';

class GameManagementScreen extends StatefulWidget {
  const GameManagementScreen({super.key});

  @override
  State<GameManagementScreen> createState() => _GameManagementScreenState();
}

class _GameManagementScreenState extends State<GameManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AdminControllerService>(
      builder: (context, adminService, child) {
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              const SizedBox(height: 32),
              _buildTabs(),
              const SizedBox(height: 24),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildGameList(adminService),
                    _buildLeaderboardPreview(),
                    _buildSystemLogs(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("GAME SYSTEM HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text("Secure server-side engine & RNG metrics", style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
        _buildActionBtn("SERVER: LIVE", LucideIcons.activity, Colors.greenAccent),
      ],
    );
  }

  Widget _buildActionBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.3))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      width: 500,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.1))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "Active Games"), Tab(text: "Leaderboard"), Tab(text: "Audit Logs")],
      ),
    );
  }

  Widget _buildGameList(AdminControllerService adminService) {
    final games = adminService.gameSettings;

    if (games.isEmpty) {
      return const Center(child: Text("No games configured in game_configs table.", style: TextStyle(color: Colors.white38)));
    }

    return ListView.builder(
      itemCount: games.length,
      itemBuilder: (context, index) {
        final game = games[index];
        final String name = (game['game_id'] as String).toUpperCase();
        final bool active = game['is_active'] ?? false;
        final double winProb = (game['win_probability'] ?? 0.0) * 100;
        
        return FadeInRight(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
            ),
            child: Row(
              children: [
                Container(
                  width: 50, height: 50,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(LucideIcons.gamepad2, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                          if (game['is_featured'] == true) ...[
                            const SizedBox(width: 8),
                            const Icon(LucideIcons.star, color: Colors.yellow, size: 14),
                          ],
                        ],
                      ),
                      Row(
                        children: [
                          Text(active ? "Operational" : "Disabled", style: TextStyle(color: active ? Colors.greenAccent : Colors.redAccent, fontSize: 12)),
                          const SizedBox(width: 12),
                          Text("Win Rate: ${winProb.toStringAsFixed(0)}%", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.settings, color: Colors.white38),
                  onPressed: () => _showEditDialog(game),
                ),
                Switch(
                  value: active, 
                  onChanged: (v) => _updateGame(game['game_id'], {'is_active': v}),
                  activeColor: const Color(0xFF6366F1)
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showEditDialog(Map<String, dynamic> game) {
    double currentProb = (game['win_probability'] ?? 0.0) * 100;
    bool isFeatured = game['is_featured'] ?? false;
    final probController = TextEditingController(text: currentProb.toStringAsFixed(0));
    final thumbController = TextEditingController(text: game['thumbnail_url'] ?? "");
    final emojiController = TextEditingController(text: game['game_emoji'] ?? "🎮");
    final colorController = TextEditingController(text: game['game_color'] ?? "#6366F1");

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: Text("Configure ${game['game_id']}", style: const TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _dialogField("Win Probability (%)", probController, isNum: true),
                const SizedBox(height: 16),
                _dialogField("Thumbnail URL", thumbController),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _dialogField("Emoji", emojiController)),
                    const SizedBox(width: 12),
                    Expanded(child: _dialogField("Theme Color (Hex)", colorController)),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text("Featured Game", style: TextStyle(color: Colors.white70)),
                    Switch(
                      value: isFeatured,
                      onChanged: (v) => setDialogState(() => isFeatured = v),
                      activeColor: Colors.yellow,
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL", style: TextStyle(color: Colors.white38))),
            ElevatedButton(
              onPressed: () {
                _updateGame(game['game_id'], {
                  'win_probability': (double.tryParse(probController.text) ?? 50) / 100,
                  'is_featured': isFeatured,
                  'thumbnail_url': thumbController.text,
                  'game_emoji': emojiController.text,
                  'game_color': colorController.text,
                });
                Navigator.pop(context);
              },
              child: const Text("SAVE CHANGES"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dialogField(String label, TextEditingController controller, {bool isNum = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: isNum ? TextInputType.number : TextInputType.text,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.black26,
            isDense: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }

  Future<void> _updateGame(String gameId, Map<String, dynamic> updates) async {
    setState(() => _isProcessing = true);
    final success = await _api.updateGameConfig(gameId, updates);
    if (mounted) {
       setState(() => _isProcessing = false);
       if (!success) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Sync Error: Check Console"), backgroundColor: Colors.redAccent));
       }
    }
  }

  Widget _buildLeaderboardPreview() {
     return const Center(child: Text("High-Roller Leaderboard Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildSystemLogs() {
     return const Center(child: Text("Game Server Audit Logs Parity Pending", style: TextStyle(color: Colors.white24)));
  }
}



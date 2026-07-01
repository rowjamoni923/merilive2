import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:provider/provider.dart';
import '../../services/livekit_service.dart';
import '../../services/api_service.dart';
import '../../widgets/starry_nebula_background.dart';
import '../../widgets/avatar_with_frame.dart';
import '../../services/admin_controller_service.dart';

class CreatePartyScreen extends StatefulWidget {
  const CreatePartyScreen({super.key});

  @override
  State<CreatePartyScreen> createState() => _CreatePartyScreenState();
}

class _CreatePartyScreenState extends State<CreatePartyScreen> {
  final ApiService _api = ApiService();
  final LiveKitService _liveKit = LiveKitService();
  String _mode = 'video'; // video, audio, game
  String? _selectedGame;
  bool _isCreating = false;
  Map<String, dynamic>? _currentUser;
  final TextEditingController _titleController = TextEditingController();

  final List<Map<String, dynamic>> _games = [
    {'id': 'lucky_28', 'name': 'Lucky 28', 'emoji': '🎰', 'color': Colors.orange},
    {'id': 'aviator', 'name': 'Aviator', 'emoji': '🚀', 'color': Colors.red},
    {'id': 'plinko', 'name': 'Plinko', 'emoji': '🔵', 'color': Colors.blue},
    {'id': 'dragon_tiger', 'name': 'Dragon Tiger', 'emoji': '🐉', 'color': Colors.amber},
    {'id': 'andar_bahar', 'name': 'Andar Bahar', 'emoji': '🃏', 'color': Colors.green},
    {'id': 'crash', 'name': 'Crash', 'emoji': '📈', 'color': Colors.purple},
  ];

  @override
  void initState() {
    super.initState();
    _initData();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _liveKit.stopPreviewTracks();
    super.dispose();
  }

  Future<void> _initData() async {
    final profile = await _api.getMyProfile();
    setState(() => _currentUser = profile);
    _startCamera();
  }

  Future<void> _startCamera() async {
    await _liveKit.createPreviewTracks(isAudioOnly: _mode == 'audio');
    if (mounted) setState(() {});
  }

  Future<void> _handleCreateParty() async {
    final userLevel = _currentUser?['user_level'] ?? 1;
    final isAdmin = _currentUser?['is_admin'] == true;
    
    final admin = AdminControllerService();
    final isHost = _currentUser?['is_host'] == true;
    final access = admin.canAccessFeature('create_party', userLevel, isHost);
    
    if (!access.canAccess && !isAdmin) {
      HapticFeedback.vibrate();
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: const Color(0xFF1E1B4B),
          title: Text("Level ${access.requiredLevel} Required", style: const TextStyle(color: Colors.white)),
          content: Text("You must reach Level ${access.requiredLevel} to create a party room. Keep sharing and connected!", style: const TextStyle(color: Colors.white70)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text("OK", style: TextStyle(color: Color(0xFFD946EF)))),
          ],
        ),
      );
      return;
    }

    if (_mode == 'game' && _selectedGame == null) {
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please select a game first")));
      return;
    }

    setState(() => _isCreating = true);
    try {
      final roomData = await _api.createPartyRoom(
        title: "${_currentUser?['display_name'] ?? 'User'}'s Party",
        roomType: _mode,
        gameMode: _selectedGame,
      );

      if (mounted && roomData != null) {
        // Stop preview tracks before navigating to actual room which will initialize its own tracks
        await _liveKit.stopPreviewTracks();
        Navigator.pushReplacementNamed(context, '/party_room', arguments: roomData);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Failed to create party: $e")));
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StarryNebulaBackground(
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              const Spacer(),
              _buildMainContent(),
              const Spacer(),
              _buildBottomControls(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMainContent() {
    return Column(
      children: [
        FadeInDown(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withOpacity(0.03), border: Border.all(color: Colors.white10)),
            child: const Icon(LucideIcons.mic, color: Colors.blueAccent, size: 64),
          ),
        ),
        const SizedBox(height: 32),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            children: [
              TextField(
                controller: _titleController,
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
                decoration: InputDecoration(
                  hintText: "Party Room Title",
                  hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
                  border: InputBorder.none,
                ),
              ),
              Container(width: 150, height: 1, color: Colors.white10),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Host Identity
          Stack(
            clipBehavior: Clip.none,
            children: [
              AvatarWithFrame(
                userId: _currentUser?['id'] ?? "",
                name: _currentUser?['display_name'] ?? "User",
                src: _currentUser?['avatar_url'],
                level: _currentUser?['user_level'] ?? 1,
                isHost: _currentUser?['is_host'] == true || _currentUser?['gender'] == 'female',
                size: 50,
              ),
              Positioned(
                bottom: -2,
                right: -2,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF4ADE80), Color(0xFF10B981)]),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white, width: 2),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4)],
                  ),
                  child: const Icon(LucideIcons.check, color: Colors.white, size: 12),
                ),
              ),
            ],
          ),
          // Close button
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.3),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white24),
              ),
              child: const Icon(LucideIcons.x, color: Colors.white, size: 24),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModeSelector() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          _buildModeTab('video', "Video"),
          _buildModeTab('audio', "Audio"),
          _buildModeTab('game', "Game"),
        ],
      ),
    );
  }

  Widget _buildModeTab(String id, String label) {
    final isActive = _mode == id;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          setState(() => _mode = id);
          _startCamera();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isActive ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              label,
              style: GoogleFonts.outfit(
                color: isActive ? Colors.black : Colors.white60,
                fontSize: 14,
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomControls() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _buildRoundAction(LucideIcons.wand2),
              const SizedBox(width: 16),
              Expanded(
                child: GestureDetector(
                  onTap: _isCreating ? null : _handleCreateParty,
                  child: Pulse(
                    infinite: true,
                    duration: const Duration(seconds: 2),
                    child: Container(
                      height: 56,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFC026D3)]),
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [BoxShadow(color: const Color(0xFF7C3AED).withOpacity(0.4), blurRadius: 20)],
                      ),
                      child: Center(
                        child: Text(
                          _isCreating ? "CREATING..." : "LET'S PARTY",
                          style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1.5),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              _buildRoundAction(LucideIcons.smile),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            "Level 30 Required for Global Discovery",
            style: TextStyle(color: Colors.white38, fontSize: 10),
          ),
        ],
      ),
    );
  }

  Widget _buildRoundAction(IconData icon) {
    return Container(
      width: 48, height: 48,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white24),
      ),
      child: Icon(icon, color: Colors.white, size: 24),
    );
  }

  IconData _getModeIcon() {
    switch (_mode) {
      case 'audio': return LucideIcons.mic;
      case 'game': return LucideIcons.gamepad2;
      default: return LucideIcons.radio;
    }
  }

  Color _getModeColor() {
    switch (_mode) {
      case 'audio': return Colors.greenAccent;
      case 'game': return Colors.orangeAccent;
      default: return Colors.blueAccent;
    }
  }
}




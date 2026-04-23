import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:livekit_client/livekit_client.dart';
import '../../services/livekit_service.dart';
import '../../services/api_service.dart';
import '../../widgets/avatar_with_frame.dart';
import 'live_room_screen.dart';

class GoLiveScreen extends StatefulWidget {
  const GoLiveScreen({super.key});

  @override
  State<GoLiveScreen> createState() => _GoLiveScreenState();
}

class _GoLiveScreenState extends State<GoLiveScreen> {
  final LiveKitService _liveKit = LiveKitService();
  final ApiService _api = ApiService();
  final TextEditingController _titleController = TextEditingController();
  
  Map<String, dynamic>? _currentUser;
  bool _isStarting = false;
  bool _isFrontCamera = true;
  bool _isBeautyEnabled = true;

  @override
  void initState() {
    super.initState();
    _initData();
  }

  Future<void> _initData() async {
    final profile = await _api.getMyProfile();
    setState(() => _currentUser = profile);
    _startPreview();
  }

  Future<void> _startPreview() async {
    await _liveKit.createPreviewTracks(isAudioOnly: false);
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _liveKit.stopPreviewTracks();
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _handleStartLive() async {
    if (_titleController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please add a catchy title!")));
      return;
    }

    if (_currentUser == null) return;

    // AUDIO 7 Requirement: Strict Guard (Face Verification + Avatar mandatory to go live)
    final bool isFaceVerified = _currentUser!['is_face_verified'] == true;
    final bool hasAvatar = _currentUser!['avatar_url'] != null && _currentUser!['avatar_url'].toString().isNotEmpty;

    if (!isFaceVerified) {
       _showStrictError("Face Verification Required", "Please complete face verification in Settings before going live.");
       return;
    }

    if (!hasAvatar) {
       _showStrictError("Profile Photo Required", "Please upload a real profile photo to continue.");
       return;
    }

    setState(() => _isStarting = true);
    try {
      final roomData = await _api.createLiveRoom(
        title: _titleController.text,
      );

      if (mounted && roomData != null) {
        await _liveKit.stopPreviewTracks();
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => LiveRoomScreen(
              roomId: roomData['id'].toString(),
            ),
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Failed to start live: $e")));
    } finally {
      if (mounted) setState(() => _isStarting = false);
    }
  }

  void _showStrictError(String title, String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide(color: Colors.redAccent.withOpacity(0.5))),
        title: Row(
          children: [
            const Icon(LucideIcons.alertTriangle, color: Colors.redAccent),
            const SizedBox(width: 12),
            Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(message, style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("CLOSE", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              // Navigate to appropriate screen based on error
              if (title.contains("Face")) Navigator.pushNamed(context, '/settings');
              else Navigator.pushNamed(context, '/my-profile');
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3B82F6), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            child: const Text("FIX NOW"),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Full Screen Camera Preview
          if (_liveKit.localVideoTrack != null)
            VideoTrackRenderer(_liveKit.localVideoTrack!)
          else
            const Center(child: CircularProgressIndicator(color: Color(0xFFD946EF))),

          // 2. Vignette & Overlays
          _buildVignette(),

          // 3. UI Layer
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                const Spacer(),
                _buildBottomSection(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVignette() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withOpacity(0.5),
            Colors.transparent,
            Colors.transparent,
            Colors.black.withOpacity(0.8),
          ],
          stops: const [0.0, 0.2, 0.7, 1.0],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Host Info with Check
          FadeInLeft(
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    AvatarWithFrame(
                      userId: _currentUser?['id'] ?? "",
                      name: _currentUser?['display_name'] ?? "User",
                      src: _currentUser?['avatar_url'],
                      level: _currentUser?['user_level'] ?? 1,
                      isHost: true,
                      size: 44,
                    ),
                    Positioned(
                      bottom: -2,
                      right: -2,
                      child: Container(
                        width: 18, height: 18,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [Color(0xFF4ADE80), Color(0xFF10B981)]),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(LucideIcons.check, color: Colors.white, size: 10),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _currentUser?['display_name'] ?? 'Loading...',
                      style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    Row(
                      children: [
                        const Icon(LucideIcons.mapPin, color: Colors.white70, size: 10),
                        const SizedBox(width: 4),
                        Text("Global", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 10)),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Close button
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.black38, shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
              child: const Icon(LucideIcons.x, color: Colors.white, size: 24),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        children: [
          // Transparent Title Input
          FadeInUp(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 0),
              child: TextField(
                controller: _titleController,
                textAlign: TextAlign.center,
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                decoration: InputDecoration(
                  hintText: "ADD A CATCHY TITLE...",
                  hintStyle: GoogleFonts.outfit(color: Colors.white38, fontSize: 24, fontWeight: FontWeight.w900),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
          const SizedBox(height: 48),
          // Controls Row
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildRoundAction(LucideIcons.switchCamera, "Flip"),
              const SizedBox(width: 24),
              _buildStartButton(),
              const SizedBox(width: 24),
              _buildRoundAction(LucideIcons.wand2, "Beauty"),
            ],
          ),
          const SizedBox(height: 24),
          // More Menu / Emoji
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.smile, color: Colors.white54, size: 20),
              const SizedBox(width: 32),
              const Icon(LucideIcons.share2, color: Colors.white54, size: 20),
              const SizedBox(width: 32),
              const Icon(LucideIcons.settings, color: Colors.white54, size: 20),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStartButton() {
    return GestureDetector(
      onTap: _isStarting ? null : _handleStartLive,
      child: Pulse(
        infinite: true,
        duration: const Duration(milliseconds: 2000),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF), Color(0xFFEC4899)]),
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(color: const Color(0xFFD946EF).withOpacity(0.6), blurRadius: 25, spreadRadius: 4),
            ],
          ),
          child: Text(
            _isStarting ? "STARTING..." : "GO LIVE",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2),
          ),
        ),
      ),
    );
  }

  Widget _buildRoundAction(IconData icon, String label) {
    return Column(
      children: [
        Container(
          width: 50, height: 50,
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.3),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white24),
          ),
          child: Icon(icon, color: Colors.white, size: 24),
        ),
        const SizedBox(height: 8),
        Text(label, style: GoogleFonts.outfit(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
      ],
    );
  }
}



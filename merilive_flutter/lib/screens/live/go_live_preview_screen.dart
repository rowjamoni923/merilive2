import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:livekit_client/livekit_client.dart';
import '../../services/live_service.dart';
import '../../services/livekit_service.dart';
import '../../services/beauty_service.dart';
import '../../theme/app_theme.dart';
import 'dart:ui';
import 'components/beauty_control_panel.dart';
import 'components/sticker_selector_panel.dart';

class GoLivePreviewScreen extends StatefulWidget {
  const GoLivePreviewScreen({super.key});

  @override
  State<GoLivePreviewScreen> createState() => _GoLivePreviewScreenState();
}

class _GoLivePreviewScreenState extends State<GoLivePreviewScreen> {
  final TextEditingController _titleController = TextEditingController();
  String _selectedMode = 'live';

  @override
  void initState() {
    super.initState();
    _initializePreview();
  }

  void _initializePreview() async {
    final liveKit = context.read<LiveKitService>();
    if (_selectedMode == 'live') {
      await liveKit.createPreviewTracks(isAudioOnly: false);
    } else {
      await liveKit.createPreviewTracks(isAudioOnly: true);
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _handleGoLive() async {
    final liveService = context.read<LiveService>();
    
    // 1. Check Eligibility (Master Logic)
    final eligibility = await liveService.checkGoLiveEligibility();
    
    if (eligibility['eligible'] != true) {
      if (!mounted) return;
      _showEligibilityModal(eligibility['reason'], eligibility['banInfo']);
      return;
    }

    if (_titleController.text.trim().isEmpty) {
      _titleController.text = "${eligibility['profile']['display_name']}'s Live";
    }

    final success = await liveService.startLiveStream(
      title: _titleController.text.trim(),
      thumbnailUrl: '',
      beautySettings: {},
      isParty: _selectedMode == 'party',
    );

    if (success && mounted) {
      Navigator.pushReplacementNamed(context, '/live_stream');
    }
  }

  void _showEligibilityModal(String reason, dynamic banInfo) {
    String title = "Attention";
    String message = "You cannot go live at this time.";
    IconData icon = Icons.warning_amber_rounded;
    Color color = Colors.orange;

    switch (reason) {
      case 'PROFILE_PHOTO_REQUIRED':
        title = "Photo Required";
        message = "Please upload a real profile photo to start your live stream.";
        icon = Icons.add_a_photo;
        break;
      case 'FACE_VERIFICATION_REQUIRED':
        title = "Verify Your Face";
        message = "Face verification is required for all hosts to ensure safety.";
        icon = Icons.face_retouching_natural;
        color = AppTheme.primaryPink;
        break;
      case 'BANNED':
        title = "🚫 Live Banned";
        final reasonText = banInfo?['ban_reason'] ?? 'Policy violation';
        message = "Reason: $reasonText\nRemaining: ${banInfo?['remaining_hours']?.ceil() ?? 0} hours";
        icon = Icons.block;
        color = Colors.red;
        break;
    }

    showDialog(
      context: context,
      builder: (context) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: AlertDialog(
          backgroundColor: Colors.black.withOpacity(0.8),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
          title: Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 10),
              Text(title, style: const TextStyle(color: Colors.white)),
            ],
          ),
          content: Text(message, style: const TextStyle(color: Colors.white70)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("Later", style: TextStyle(color: Colors.white54)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: color, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))),
              onPressed: () {
                Navigator.pop(context);
                if (reason == 'PROFILE_PHOTO_REQUIRED' || reason == 'FACE_VERIFICATION_REQUIRED') {
                  // Navigate to verification/profile
                }
              },
              child: Text(reason == 'BANNED' ? "Understood" : "Verify Now", style: const TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final liveKit = context.watch<LiveKitService>();
    final videoTrack = liveKit.localVideoTrack;
    final liveService = context.watch<LiveService>();

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Preview
          if (_selectedMode == 'live' && videoTrack != null)
            VideoTrackRenderer(videoTrack)
          else if (_selectedMode == 'party')
            _buildPartyBackground()
          else
            const Center(child: CircularProgressIndicator(color: AppTheme.primaryPink)),

          // 2. Overlays
          _buildTopOverlay(),
          _buildRightControls(), // New Right Side Controls (Beauty/Stickers)
          _buildBottomOverlay(),
          _buildModeSwitcher(),

          // 3. Starting State
          if (liveService.isStarting)
            Container(
              color: Colors.black87,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: AppTheme.primaryPink),
                    SizedBox(height: 20),
                    Text("Preparing your stream...", style: TextStyle(color: Colors.white, fontSize: 16)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPartyBackground() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1A1A1A), Color(0xFF0D0D0D)],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(40),
              decoration: BoxDecoration(
                color: AppTheme.primaryPink.withOpacity(0.1),
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.primaryPink.withOpacity(0.2)),
              ),
              child: const Icon(Icons.mic, color: AppTheme.primaryPink, size: 80),
            ),
            const SizedBox(height: 20),
            const Text('Party Room Mode', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text('Audio-only social room', style: TextStyle(color: Colors.white54, fontSize: 16)),
          ],
        ),
      ),
    );
  }

  Widget _buildModeSwitcher() {
    return Positioned(
      bottom: 150,
      left: 0,
      right: 0,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _buildModeTab('live', 'Live'),
          const SizedBox(width: 40),
          _buildModeTab('party', 'Party'),
        ],
      ),
    );
  }

  Widget _buildModeTab(String mode, String label) {
    bool isSelected = _selectedMode == mode;
    return GestureDetector(
      onTap: () {
        setState(() => _selectedMode = mode);
        _initializePreview();
      },
      child: Column(
        children: [
          Text(label, style: TextStyle(color: isSelected ? Colors.white : Colors.white54, fontSize: 18, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
          const SizedBox(height: 4),
          if (isSelected) Container(width: 30, height: 3, decoration: BoxDecoration(color: AppTheme.primaryPink, borderRadius: BorderRadius.circular(2))),
        ],
      ),
    );
  }

  Widget _buildTopOverlay() {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 10,
      left: 16,
      right: 16,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.close, color: Colors.white, size: 30),
            onPressed: () => Navigator.pop(context),
          ),
          Row(
            children: [
              _buildIconBtn(Icons.flip_camera_ios, "Flip", () {
                context.read<BeautyService>().switchCamera();
              }),
              const SizedBox(width: 20),
              _buildIconBtn(Icons.settings, "Settings", () {}),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRightControls() {
    return Positioned(
      right: 16,
      top: MediaQuery.of(context).size.height * 0.25,
      child: Column(
        children: [
          _buildActionBtn(Icons.face_retouching_natural, "Beauty", () {
            _showBeautyPanel();
          }),
          const SizedBox(height: 25),
          _buildActionBtn(Icons.auto_awesome, "Stickers", () {
            _showStickerPanel();
          }),
          const SizedBox(height: 25),
          _buildActionBtn(Icons.flash_on, "Flash", () {}),
        ],
      ),
    );
  }

  Widget _buildActionBtn(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.black38,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white24),
            ),
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  void _showBeautyPanel() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => const BeautyControlPanel(),
    );
  }

  void _showStickerPanel() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => const StickerSelectorPanel(),
    );
  }

  Widget _buildIconBtn(IconData icon, String label, VoidCallback onTap) {
    return Column(
      children: [
        Icon(icon, color: Colors.white, size: 24),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 10)),
      ],
    );
  }

  Widget _buildBottomOverlay() {
    return Positioned(
      bottom: MediaQuery.of(context).padding.bottom + 30,
      left: 24,
      right: 24,
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(15),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                color: Colors.white10,
                child: TextField(
                  controller: _titleController,
                  style: const TextStyle(color: Colors.white, fontSize: 18),
                  decoration: const InputDecoration(hintText: "Add a title...", hintStyle: TextStyle(color: Colors.white54), border: InputBorder.none),
                ),
              ),
            ),
          ),
          const SizedBox(height: 100),
          GestureDetector(
            onTap: _handleGoLive,
            child: Container(
              height: 55,
              width: double.infinity,
              decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(30), boxShadow: [BoxShadow(color: AppTheme.primaryPink.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 5))]),
              child: const Center(child: Text("GO LIVE", style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 2))),
            ),
          ),
        ],
      ),
    );
  }
}

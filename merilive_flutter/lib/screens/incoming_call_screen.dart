import 'package:google_fonts/google_fonts.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import 'package:audioplayers/audioplayers.dart'; // Will require audioplayers package later
import 'room/live_room_screen.dart';
import 'premium_private_call_screen.dart';

class IncomingCallScreen extends StatefulWidget {
  final String callerName;
  final String roomId;
  final String? callerAvatar;

  const IncomingCallScreen({
    super.key,
    required this.callerName,
    required this.roomId,
    this.callerAvatar,
  });

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  final AudioPlayer _audioPlayer = AudioPlayer(); // Placeholder for actual ringing logic

  @override
  void initState() {
    super.initState();
    // Setup pulsing animation for the Answer button
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);

    _startRinging();
  }

  Future<void> _startRinging() async {
    // In actual implementation, play a local asset sound
    // await _audioPlayer.play(AssetSource('sounds/premium_ringtone.mp3'));
    debugPrint("Ringing started...");
  }

  Future<void> _stopRinging() async {
    // await _audioPlayer.stop();
    debugPrint("Ringing stopped.");
  }

  void _handleAccept() {
    _stopRinging();
    // Navigate to LiveKit processing room with CALL type
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => PremiumPrivateCallScreen(
          peerData: {
            'id': widget.roomId, 
            'display_name': widget.callerName,
            'avatar_url': widget.callerAvatar,
          },
          roomId: widget.roomId,
          isHost: true, // Host is the one receiving the call
        ),
      ),
    );
  }

  void _handleDecline() {
    _stopRinging();
    // Emit Supabase/LiveKit event to reject
    Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _stopRinging();
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Background Blur Image
          Image.network(
            widget.callerAvatar ?? 'https://via.placeholder.com/600',
            fit: BoxFit.cover,
            color: Colors.black.withOpacity(0.6),
            colorBlendMode: BlendMode.darken,
          ),
          
          BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black.withOpacity(0.4), Colors.black.withOpacity(0.7)],
                ),
              ),
            ),
          ),

          SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Top section (Caller Info)
                Column(
                  children: [
                    const SizedBox(height: 80),
                    Container(
                      width: 160, height: 160,
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF6366F1)]),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFD946EF).withOpacity(0.5),
                            blurRadius: 40,
                            spreadRadius: 5,
                          )
                        ]
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.black, width: 4),
                          image: DecorationImage(
                            image: NetworkImage(widget.callerAvatar ?? 'https://via.placeholder.com/300'),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 40),
                    Text(
                      widget.callerName,
                      style: GoogleFonts.inter(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900, letterSpacing: -1),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(LucideIcons.video, color: Color(0xFFD946EF), size: 16),
                        const SizedBox(width: 8),
                        Text(
                          "Incoming Video Call",
                          style: GoogleFonts.inter(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600, letterSpacing: 0.5),
                        ),
                      ],
                    ),
                  ],
                ),

                // Bottom Section (Action Buttons)
                Padding(
                  padding: const EdgeInsets.only(bottom: 100, left: 40, right: 40),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      // Decline Button
                      _buildActionButton(
                        onTap: _handleDecline,
                        icon: LucideIcons.phoneOff,
                        label: "Decline",
                        color: const Color(0xFFEF4444),
                      ),

                      // Accept Button
                      _buildActionButton(
                        onTap: _handleAccept,
                        icon: LucideIcons.phoneCall,
                        label: "Accept",
                        color: const Color(0xFF10B981),
                        isPulsing: true,
                      ),
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

  Widget _buildActionButton({
    required VoidCallback onTap,
    required IconData icon,
    required String label,
    required Color color,
    bool isPulsing = false,
  }) {
    return Column(
      children: [
        GestureDetector(
          onTap: onTap,
          child: AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: color.withOpacity(isPulsing ? 0.6 * _pulseController.value : 0.4),
                      blurRadius: isPulsing ? 40 * _pulseController.value : 20,
                      spreadRadius: isPulsing ? 10 * _pulseController.value : 0,
                    )
                  ],
                ),
                child: Icon(icon, color: Colors.white, size: 34),
              );
            }
          ),
        ),
        const SizedBox(height: 16),
        Text(
          label,
          style: GoogleFonts.inter(color: Colors.white.withOpacity(0.8), fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}



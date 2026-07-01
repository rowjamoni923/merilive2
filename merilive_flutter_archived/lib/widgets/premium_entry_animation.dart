import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:lottie/lottie.dart';
import 'package:animate_do/animate_do.dart';
import 'package:audioplayers/audioplayers.dart';
import 'dynamic_avatar.dart';
import 'level_badge.dart';

class PremiumEntryAnimation extends StatefulWidget {
  final Map<String, dynamic> userData;
  final VoidCallback onComplete;

  const PremiumEntryAnimation({
    super.key,
    required this.userData,
    required this.onComplete,
  });

  @override
  State<PremiumEntryAnimation> createState() => _PremiumEntryAnimationState();
}

class _PremiumEntryAnimationState extends State<PremiumEntryAnimation> with SingleTickerProviderStateMixin {
  bool _isVisible = true;
  final AudioPlayer _audioPlayer = AudioPlayer();
  SVGAAnimationController? _svgaController;

  @override
  void initState() {
    super.initState();
    _svgaController = SVGAAnimationController(vsync: this);
    
    // Play sound if available
    _playSound();
    _loadSvga();

    // Auto-complete after 4 seconds (standard entry duration)
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() => _isVisible = false);
        Future.delayed(const Duration(milliseconds: 500), widget.onComplete);
      }
    });
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    _svgaController?.dispose();
    super.dispose();
  }

  void _playSound() async {
    // SVGA contains internal audio, so we skip external sound_url for SVGA
    final isSvga = widget.userData['equipped_entrance_type'] == 'svga';
    if (isSvga) return;

    final soundUrl = widget.userData['equipped_entrance_sound_url'];
    if (soundUrl != null && soundUrl.toString().isNotEmpty) {
      try {
        await _audioPlayer.play(UrlSource(soundUrl));
      } catch (e) {
        debugPrint('Error playing entry sound: $e');
      }
    }
  }

  void _loadSvga() async {
    final vehicleUrl = widget.userData['equipped_entrance_url'];
    final vehicleType = widget.userData['equipped_entrance_type'] ?? 'svga';
    
    if (vehicleUrl != null && vehicleType == 'svga') {
       try {
         final parser = SVGAParser();
         final videoItem = await parser.decodeFromURL(vehicleUrl);
         if (mounted) {
           setState(() {
             _svgaController?.videoItem = videoItem;
             _svgaController?.repeat();
           });
         }
       } catch (e) {
         debugPrint("Error loading SVGA: $e");
       }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isVisible) return const SizedBox();

    final userLevel = widget.userData['user_level'] ?? 1;
    final hasVehicle = widget.userData['equipped_entrance_url'] != null;
    final vehicleUrl = widget.userData['equipped_entrance_url'];
    final vehicleType = widget.userData['equipped_entrance_type'] ?? 'svga';
    
    // Gradient based on level (Parity with Web)
    final gradient = userLevel >= 100
        ? const LinearGradient(colors: [Color(0xFFB45309), Color(0xFFF59E0B), Color(0xFFFBBF24)])
        : userLevel >= 50
            ? const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFD946EF), Color(0xFFF472B6)])
            : const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF6366F1), Color(0xFF8B5CF6)]);

    return Stack(
      children: [
        // 1. Full Screen Vehicle Animation (If exists)
        if (hasVehicle && vehicleUrl != null)
          Positioned.fill(
            child: IgnorePointer(
              child: vehicleType == 'svga'
                  ? (_svgaController?.videoItem != null ? SVGAImage(_svgaController!) : const SizedBox())
                  : Lottie.network(vehicleUrl, fit: BoxFit.contain),
            ),
          ),

        // 2. Entry Name Bar (Glassmorphic)
        Positioned(
          left: 0,
          top: MediaQuery.of(context).size.height * 0.2,
          child: FadeInLeft(
            duration: const Duration(milliseconds: 600),
            child: Container(
              height: 48, // Slightly taller for better presence
              padding: const EdgeInsets.only(right: 40),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    gradient.colors[0].withOpacity(0.95),
                    gradient.colors[1].withOpacity(0.6),
                    Colors.transparent
                  ],
                ),
                borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
                border: Border.all(color: Colors.white.withOpacity(0.2), width: 1.0),
                boxShadow: [
                  BoxShadow(
                    color: gradient.colors[0].withOpacity(0.4),
                    blurRadius: 15,
                    spreadRadius: 2,
                    offset: const Offset(0, 0),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(width: 4),
                  // Avatar with Frame
                  DynamicAvatar(
                    avatarUrl: widget.userData['avatar_url'],
                    frameId: widget.userData['equipped_entry_name_bar_id'], // Name Bar frame
                    level: userLevel,
                    size: 40,
                  ),
                  const SizedBox(width: 10),
                  // User Info
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          LevelBadge(level: userLevel, size: 'xs'),
                          const SizedBox(width: 6),
                          Text(
                            widget.userData['display_name'] ?? 'User',
                            style: GoogleFonts.inter(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              shadows: [const Shadow(color: Colors.black45, blurRadius: 2)],
                            ),
                          ),
                        ],
                      ),
                      Text(
                        "joined the room",
                        style: GoogleFonts.inter(
                          color: Colors.white70,
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}



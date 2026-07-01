import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_svga/flutter_svga.dart';
import 'package:lottie/lottie.dart';
import 'package:animate_do/animate_do.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:provider/provider.dart';
import '../services/dynamic_assets_service.dart';
import 'dynamic_avatar.dart';
import 'level_badge.dart';
import 'network_svga_player.dart';

class PremiumFlyingGift extends StatefulWidget {
  final Map<String, dynamic> giftData;
  final VoidCallback onComplete;

  const PremiumFlyingGift({
    super.key,
    required this.giftData,
    required this.onComplete,
  });

  @override
  State<PremiumFlyingGift> createState() => _PremiumFlyingGiftState();
}

class _PremiumFlyingGiftState extends State<PremiumFlyingGift> with SingleTickerProviderStateMixin {
  late AnimationController _comboController;
  int _currentCount = 1;
  bool _isVisible = true;
  final AudioPlayer _audioPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _currentCount = widget.giftData['count'] ?? 1;
    _comboController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    
    // Play sound if available
    _playSound();

    // Auto-complete timer (safety)
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() => _isVisible = false);
        Future.delayed(const Duration(milliseconds: 500), widget.onComplete);
      }
    });
  }

  @override
  void dispose() {
    _comboController.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  void _playSound() async {
    // SVGA contains internal audio, so we skip external sound_url for SVGA
    final isSvga = widget.giftData['animation_type'] == 'svga';
    if (isSvga) return;

    final soundUrl = widget.giftData['sound_url'];
    if (soundUrl != null && soundUrl.toString().isNotEmpty) {
      try {
        await _audioPlayer.play(UrlSource(soundUrl));
      } catch (e) {
        debugPrint('Error playing gift sound: $e');
      }
    }
  }

  @override
  void didUpdateWidget(PremiumFlyingGift oldWidget) {
    super.didUpdateWidget(oldWidget);
    // If count increases, trigger combo animation
    if (widget.giftData['count'] != oldWidget.giftData['count']) {
      setState(() {
        _currentCount = widget.giftData['count'];
      });
      _comboController.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isVisible) return const SizedBox();

    final isPremium = (widget.giftData['coin_value'] ?? 0) >= 1000;
    final isLuxury = (widget.giftData['coin_value'] ?? 0) >= 100;
    
    final gradient = isPremium
        ? const LinearGradient(colors: [Color(0xFFB45309), Color(0xFFF59E0B), Color(0xFFFBBF24)])
        : isLuxury
            ? const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFD946EF), Color(0xFFF472B6)])
            : const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF6366F1), Color(0xFF8B5CF6)]);

    return Stack(
      children: [
        // 1. Full Screen SVGA Overlay (If premium)
        if (isPremium && widget.giftData['animation_url'] != null && widget.giftData['animation_type'] == 'svga')
          Positioned.fill(
            child: IgnorePointer(
              child: NetworkSvgaPlayer(
                resUrl: widget.giftData['animation_url'],
              ),
            ),
          ),

        // 2. Flying Banner (Chamet Style)
        Positioned(
          left: 0,
          bottom: MediaQuery.of(context).size.height * 0.25,
          child: FadeInLeft(
            duration: const Duration(milliseconds: 500),
            child: Container(
              height: 56,
              constraints: const BoxConstraints(minWidth: 200),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Glass Gradient Background
                  ClipRRect(
                    borderRadius: const BorderRadius.horizontal(right: Radius.circular(30)),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Container(
                        padding: const EdgeInsets.only(left: 4, right: 60),
                        decoration: BoxDecoration(
                          gradient: gradient.withOpacity(0.8),
                          borderRadius: const BorderRadius.horizontal(right: Radius.circular(30)),
                          border: Border.all(color: Colors.white.withOpacity(0.2)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Avatar + Frame
                            DynamicAvatar(
                              avatarUrl: widget.giftData['sender_avatar'],
                              frameId: widget.giftData['sender_frame_id'],
                              level: widget.giftData['sender_level'] ?? 1,
                              size: 48,
                            ),
                            const SizedBox(width: 8),
                            // User Info
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.giftData['sender_name'] ?? 'User',
                                  style: GoogleFonts.inter(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Row(
                                  children: [
                                    LevelBadge(level: widget.giftData['sender_level'] ?? 1, size: 'xs'),
                                    const SizedBox(width: 4),
                                    Text(
                                      "sent ${widget.giftData['gift_name']}",
                                      style: GoogleFonts.inter(
                                        color: Colors.white70,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Gift Icon (Floating on right edge)
                  Positioned(
                    right: 10,
                    top: -10,
                    child: ElasticIn(
                      delay: const Duration(milliseconds: 300),
                      child: widget.giftData['gift_icon'] != null
                          ? Image.network(
                              widget.giftData['gift_icon'],
                              width: 64,
                              height: 64,
                              fit: BoxFit.contain,
                            )
                          : const Icon(Icons.card_giftcard, color: Colors.amber, size: 48),
                    ),
                  ),

                  // Combo Counter
                  Positioned(
                    right: -90, // Adjusted for larger text
                    top: -10,
                    child: ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _comboController,
                        curve: Curves.elasticOut,
                      ),
                      child: ShaderMask(
                        shaderCallback: (bounds) => const LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0xFFFFEE00), Color(0xFFFF9900), Color(0xFFFF2200)],
                        ).createShader(bounds),
                        child: Text(
                          "x$_currentCount",
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 44, // Larger, more aggressive
                            fontWeight: FontWeight.w900,
                            fontStyle: FontStyle.italic,
                            letterSpacing: -2,
                            shadows: [
                              const Shadow(color: Colors.black, blurRadius: 10, offset: Offset(2, 2)),
                              Shadow(color: Colors.orange.withOpacity(0.5), blurRadius: 20, offset: const Offset(0, 0)),
                            ],
                          ),
                        ),
                      ),
                    ),
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



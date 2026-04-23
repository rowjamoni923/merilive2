import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';

class PartyMusicPlayer extends StatefulWidget {
  const PartyMusicPlayer({super.key});

  @override
  State<PartyMusicPlayer> createState() => _PartyMusicPlayerState();
}

class _PartyMusicPlayerState extends State<PartyMusicPlayer> {
  bool _isPlaying = false;
  double _progress = 0.3;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white.withOpacity(0.1)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                   Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: const Color(0xFF8B5CF6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(LucideIcons.music, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Now Playing",
                          style: GoogleFonts.inter(
                            color: Colors.white54,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1,
                          ),
                        ),
                        Text(
                          "Midnight City - M83",
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(_isPlaying ? LucideIcons.pause : LucideIcons.play, color: Colors.white),
                    onPressed: () => setState(() => _isPlaying = !_isPlaying),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.skipForward, color: Colors.white54, size: 20),
                    onPressed: () {},
                  ),
                ],
              ),
              const SizedBox(height: 12),
              LinearProgressIndicator(
                value: _progress,
                backgroundColor: Colors.white10,
                color: const Color(0xFFD946EF),
                minHeight: 2,
              ),
            ],
          ),
        ),
      ),
    );
  }
}



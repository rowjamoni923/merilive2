import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import '../three_d_icons.dart';
import '../avatar_with_frame.dart';

class CallEndedModal extends StatelessWidget {
  final bool isOpen;
  final VoidCallback onClose;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final int remoteUserLevel;
  final int duration;
  final int hostEarned;
  final bool isHost;
  final String endedBy;
  final String endReason;

  const CallEndedModal({
    super.key,
    required this.isOpen,
    required this.onClose,
    required this.remoteUserName,
    this.remoteUserAvatar,
    this.remoteUserLevel = 1,
    required this.duration,
    required this.hostEarned,
    required this.isHost,
    this.endedBy = 'remote',
    this.endReason = 'normal',
  });

  String _formatDuration(int seconds) {
    int mins = seconds ~/ 60;
    int secs = seconds % 60;
    return "${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}";
  }

  @override
  Widget build(BuildContext context) {
    if (!isOpen) return const SizedBox.shrink();

    if (!isHost) {
      return _buildCallerBanner(context);
    }

    return _buildHostSummary(context);
  }

  // ===== CALLER BANNER (Top Notification Style) =====
  Widget _buildCallerBanner(BuildContext context) {
    // Auto-close after 4 seconds for caller
    Future.delayed(const Duration(seconds: 4), () {
      if (isOpen) onClose();
    });

    return Stack(
      children: [
        Positioned(
          top: MediaQuery.of(context).padding.top + 16,
          left: 16,
          right: 16,
          child: SlideInDown(
            duration: const Duration(milliseconds: 500),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF1E293B).withOpacity(0.95),
                    const Color(0xFF0F172A).withOpacity(0.95),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 20, offset: const Offset(0, 10))
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Colors.red.withOpacity(0.3), Colors.pink.withOpacity(0.3)]),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.red.withOpacity(0.3)),
                    ),
                    child: const Icon(LucideIcons.phoneOff, color: Colors.redAccent, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          endReason == 'declined' ? 'Call Declined' : (endReason == 'missed' ? 'Call Missed' : 'Call Ended'),
                          style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        Text(
                          endReason == 'insufficient_coins' 
                              ? 'Insufficient balance' 
                              : (endedBy == 'remote' ? '$remoteUserName ended the call' : 'Thanks for using MeriLive!'),
                          style: GoogleFonts.outfit(color: Colors.white60, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.clock, color: Colors.blueAccent, size: 14),
                        const SizedBox(width: 4),
                        Text(_formatDuration(duration), style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                      ],
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

  // ===== HOST SUMMARY (Full Screen Modal Style) =====
  Widget _buildHostSummary(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        alignment: Alignment.center,
        children: [
          // Backdrop
          FadeIn(
            duration: const Duration(milliseconds: 300),
            child: GestureDetector(
              onTap: onClose,
              child: Container(
                color: Colors.black87,
                child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10), child: const SizedBox.expand()),
              ),
            ),
          ),

          // Modal
          ZoomIn(
            duration: const Duration(milliseconds: 400),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxWidth: 360),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1A0A2E), Color(0xFF0F0520), Color(0xFF1A0A2E)],
                  ),
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        // Decorative Glow
                        Container(
                          height: 120,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.green.withOpacity(0.2), Colors.transparent],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 32),
                          child: Column(
                            children: [
                              Pulse(
                                child: Container(
                                  width: 64, height: 64,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(colors: [Colors.green.withOpacity(0.3), Colors.emerald.withOpacity(0.3)]),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.green.withOpacity(0.3)),
                                  ),
                                  child: const Icon(LucideIcons.trendingUp, color: Colors.greenAccent, size: 28),
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(endedBy == 'remote' ? 'Caller Left' : 'Call Ended', style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              Text(endedBy == 'remote' ? '$remoteUserName ended the call' : 'Great job! Here\'s your earnings', style: GoogleFonts.outfit(color: Colors.white60, fontSize: 14)),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),
                    AvatarWithFrame(avatarUrl: remoteUserAvatar, size: 80, frameUrl: null),
                    const SizedBox(height: 12),
                    Text("Call with $remoteUserName", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14)),
                    
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: Colors.white.withOpacity(0.1)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            Column(
                              children: [
                                Row(
                                  children: [
                                    const Icon(LucideIcons.clock, color: Colors.blueAccent, size: 14),
                                    const SizedBox(width: 6),
                                    Text("Duration", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(_formatDuration(duration), style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                              ],
                            ),
                            Container(width: 1, height: 40, color: Colors.white10),
                            Column(
                              children: [
                                Row(
                                  children: [
                                    const Icon(LucideIcons.trendingUp, color: Colors.greenAccent, size: 14),
                                    const SizedBox(width: 6),
                                    Text("Earned", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    const Beans3DIcon(size: 18),
                                    const SizedBox(width: 6),
                                    Text("+$hostEarned", style: GoogleFonts.outfit(color: Colors.greenAccent, fontSize: 20, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),

                    if (hostEarned > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 20),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 16),
                            const SizedBox(width: 8),
                            Text("Beans added to your wallet!", style: GoogleFonts.outfit(color: Colors.greenAccent, fontSize: 13)),
                          ],
                        ),
                      ),

                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: GestureDetector(
                        onTap: onClose,
                        child: Container(
                          width: double.infinity,
                          height: 56,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]),
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [BoxShadow(color: Colors.green.withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 6))],
                          ),
                          child: Center(
                            child: Text("Done", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
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
      ),
    );
  }
}

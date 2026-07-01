import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import '../avatar_with_frame.dart';

class IncomingCallModal extends StatelessWidget {
  final bool isOpen;
  final String callerName;
  final String? callerAvatar;
  final int callerLevel;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const IncomingCallModal({
    super.key,
    required this.isOpen,
    required this.callerName,
    this.callerAvatar,
    this.callerLevel = 1,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  Widget build(BuildContext context) {
    if (!isOpen) return const SizedBox.shrink();

    return Stack(
      children: [
        // Backdrop
        FadeIn(
          duration: const Duration(milliseconds: 300),
          child: GestureDetector(
            onTap: onDecline,
            child: Container(
              color: Colors.black.withOpacity(0.3),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 2, sigmaY: 2),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        ),

        // Floating Card
        Positioned(
          top: MediaQuery.of(context).padding.top + 16,
          left: 12,
          right: 12,
          child: ElasticInDown(
            duration: const Duration(milliseconds: 600),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF0F0524),
                    Color(0xFF1A0A35),
                    Color(0xFF0D0420),
                  ],
                ),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.6), blurRadius: 40, offset: const Offset(0, 20)),
                  BoxShadow(color: Colors.green.withOpacity(0.1), blurRadius: 20, spreadRadius: 5),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Pulse(
                            infinite: true,
                            child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            "INCOMING VIDEO CALL",
                            style: GoogleFonts.outfit(
                              color: Colors.greenAccent.withOpacity(0.8),
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.green.withOpacity(0.2)),
                        ),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.radio, color: Colors.greenAccent, size: 10),
                            const SizedBox(width: 4),
                            Text("LIVE", style: GoogleFonts.outfit(color: Colors.greenAccent, fontSize: 8, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Main Row
                  Row(
                    children: [
                      // Avatar
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          Pulse(
                            infinite: true,
                            child: Container(
                              width: 64,
                              height: 64,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.greenAccent.withOpacity(0.3)),
                              ),
                            ),
                          ),
                          AvatarWithFrame(avatarUrl: callerAvatar, size: 56, frameUrl: null),
                        ],
                      ),
                      const SizedBox(width: 12),

                      // Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    callerName,
                                    style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (callerLevel >= 20)
                                  const Padding(
                                    padding: EdgeInsets.only(left: 4),
                                    child: Icon(LucideIcons.sparkles, color: Colors.amber, size: 16),
                                  ),
                              ],
                            ),
                            Text("Tap to answer the call", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12)),
                          ],
                        ),
                      ),

                      // Actions
                      Row(
                        children: [
                          _buildActionBtn(LucideIcons.phoneOff, Colors.red, onDecline),
                          const SizedBox(width: 12),
                          _buildActionBtn(LucideIcons.phone, Colors.green, onAccept, isAccept: true),
                        ],
                      ),
                    ],
                  ),

                  // Visualizer
                  const SizedBox(height: 12),
                  _buildVisualizer(),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionBtn(IconData icon, Color color, VoidCallback onTap, {bool isAccept = false}) {
    return ZoomIn(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: isAccept ? 52 : 44,
          height: isAccept ? 52 : 44,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isAccept 
                  ? [const Color(0xFF4ADE80), const Color(0xFF10B981)]
                  : [const Color(0xFFEF4444), const Color(0xFFB91C1C)],
            ),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(color: color.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 4)),
            ],
          ),
          child: Icon(icon, color: Colors.white, size: isAccept ? 24 : 20),
        ),
      ),
    );
  }

  Widget _buildVisualizer() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(12, (index) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: _VisualizerBar(index: index),
        );
      }),
    );
  }
}

class _VisualizerBar extends StatefulWidget {
  final int index;
  const _VisualizerBar({required this.index});

  @override
  State<_VisualizerBar> createState() => _VisualizerBarState();
}

class _VisualizerBarState extends State<_VisualizerBar> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 400 + (widget.index * 100) % 300),
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 4, end: 12 + (widget.index % 4) * 4).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: 2,
          height: _animation.value,
          decoration: BoxDecoration(
            color: Colors.greenAccent.withOpacity(0.4),
            borderRadius: BorderRadius.circular(2),
          ),
        );
      },
    );
  }
}

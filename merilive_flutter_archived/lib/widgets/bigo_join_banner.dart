import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import 'level_badge.dart';

class BigoJoinBanner extends StatefulWidget {
  final Map<String, dynamic> userData;
  final VoidCallback onComplete;

  const BigoJoinBanner({
    super.key,
    required this.userData,
    required this.onComplete,
  });

  @override
  State<BigoJoinBanner> createState() => _BigoJoinBannerState();
}

class _BigoJoinBannerState extends State<BigoJoinBanner> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _offsetAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _offsetAnimation = Tween<Offset>(
      begin: const Offset(-1.5, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.elasticOut,
    ));

    _opacityAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.4, curve: Curves.easeIn),
    ));

    _controller.forward();

    // Auto-remove after 4 seconds
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        _controller.reverse().then((_) => widget.onComplete());
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _offsetAnimation,
      child: FadeTransition(
        opacity: _opacityAnimation,
        child: Container(
          margin: const EdgeInsets.only(left: 16, bottom: 8),
          child: ClipRRect(
            borderRadius: const BorderRadius.horizontal(left: Radius.circular(30), right: Radius.circular(10)),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Container(
                padding: const EdgeInsets.fromLTRB(4, 4, 16, 4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      const Color(0xFF8B5CF6).withOpacity(0.8),
                      const Color(0xFFD946EF).withOpacity(0.2),
                    ],
                  ),
                  borderRadius: const BorderRadius.horizontal(left: Radius.circular(30), right: Radius.circular(10)),
                  border: Border.all(color: Colors.white.withOpacity(0.15)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 14,
                      backgroundImage: NetworkImage(widget.userData['avatar_url'] ?? 'https://via.placeholder.com/50'),
                    ),
                    const SizedBox(width: 8),
                    LevelBadge(level: widget.userData['user_level'] ?? 1, size: 'xs'),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        "${widget.userData['display_name'] ?? 'User'} joined!",
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          shadows: [const Shadow(color: Colors.black26, blurRadius: 4)],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(LucideIcons.sparkles, color: Color(0xFFFBBF24), size: 14),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}



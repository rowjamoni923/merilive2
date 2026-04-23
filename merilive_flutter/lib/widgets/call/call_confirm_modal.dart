import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../three_d_icons.dart';
import '../avatar_with_frame.dart';
import '../../services/api_service.dart';

class CallConfirmModal extends StatefulWidget {
  final String hostId;
  final String hostName;
  final String? hostAvatar;
  final int hostLevel;
  final int userCoins;
  final VoidCallback onConfirm;

  const CallConfirmModal({
    super.key,
    required this.hostId,
    required this.hostName,
    this.hostAvatar,
    this.hostLevel = 1,
    required this.userCoins,
    required this.onConfirm,
  });

  static Future<void> show(
    BuildContext context, {
    required String hostId,
    required String hostName,
    String? hostAvatar,
    int hostLevel = 1,
    required int userCoins,
    required VoidCallback onConfirm,
  }) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: "CallConfirm",
      pageBuilder: (ctx, anim1, anim2) => CallConfirmModal(
        hostId: hostId,
        hostName: hostName,
        hostAvatar: hostAvatar,
        hostLevel: hostLevel,
        userCoins: userCoins,
        onConfirm: onConfirm,
      ),
      transitionBuilder: (ctx, anim1, anim2, child) {
        return FadeTransition(
          opacity: anim1,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.8, end: 1.0).animate(
              CurvedAnimation(parent: anim1, curve: Curves.easeOutBack),
            ),
            child: child,
          ),
        );
      },
    );
  }

  @override
  State<CallConfirmModal> createState() => _CallConfirmModalState();
}

class _CallConfirmModalState extends State<CallConfirmModal> with TickerProviderStateMixin {
  final _api = ApiService();
  int? _callRate;
  bool _loading = true;

  late AnimationController _rippleController;

  @override
  void initState() {
    super.initState();
    _fetchCallRate();
    _rippleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _rippleController.dispose();
    super.dispose();
  }

  Future<void> _fetchCallRate() async {
    try {
      final res = await _api.supabase
          .from('profiles')
          .select('call_rate_per_minute')
          .eq('id', widget.hostId)
          .maybeSingle();
      
      if (mounted) {
        setState(() {
          _callRate = res?['call_rate_per_minute'] ?? 60; // Fallback to 60
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rateConfigured = _callRate != null && _callRate! > 0;
    final hasEnoughCoins = rateConfigured && widget.userCoins >= _callRate!;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(32),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxWidth: 360),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF1E293B).withOpacity(0.9),
                    const Color(0xFF0F172A).withOpacity(0.95),
                  ],
                ),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.5),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  )
                ],
              ),
              child: Material(
                color: Colors.transparent,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildHeader(),
                    _buildRateSection(rateConfigured),
                    _buildActionButtons(rateConfigured, hasEnoughCoins),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Stack(
      alignment: Alignment.center,
      children: [
        // Background Glow
        Positioned(
          top: -20,
          child: Container(
            width: 200,
            height: 100,
            decoration: BoxDecoration(
              gradient: RadialGradient(
                colors: [
                  const Color(0xFFD946EF).withOpacity(0.2),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),
        
        Padding(
          padding: const EdgeInsets.only(top: 40, bottom: 20),
          child: Column(
            children: [
              // Avatar with Ripple
              Stack(
                alignment: Alignment.center,
                children: [
                  AnimatedBuilder(
                    animation: _rippleController,
                    builder: (context, child) {
                      return Container(
                        width: 120 * _rippleController.value,
                        height: 120 * _rippleController.value,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: const Color(0xFFEC4899).withOpacity(1 - _rippleController.value),
                            width: 2,
                          ),
                        ),
                      );
                    },
                  ),
                  AvatarWithFrame(
                    avatarUrl: widget.hostAvatar,
                    size: 96,
                    frameUrl: null, // Add logic for frames if needed
                  ),
                  Positioned(
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)]),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white24),
                        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
                      ),
                      child: Text(
                        "Lv.${widget.hostLevel}",
                        style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                widget.hostName,
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
        
        // Close Button
        Positioned(
          top: 16,
          right: 16,
          child: IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(LucideIcons.x, color: Colors.white.withOpacity(0.5), size: 20),
          ),
        ),
      ],
    );
  }

  Widget _buildRateSection(bool rateConfigured) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              const Color(0xFFF59E0B).withOpacity(0.1),
              const Color(0xFFEA580C).withOpacity(0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.2)),
        ),
        child: Row(
          children: [
            const Diamond3DIcon(size: 40),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Per minute", style: GoogleFonts.outfit(color: Colors.white60, fontSize: 12)),
                  Row(
                    children: [
                      Text(
                        _loading ? "..." : (_callRate?.toString() ?? "0"),
                        style: GoogleFonts.outfit(color: const Color(0xFFF59E0B), fontSize: 24, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(width: 4),
                      const Text("💎", style: TextStyle(fontSize: 16)),
                    ],
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black26,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.clock, color: Colors.white38, size: 14),
                  const SizedBox(width: 6),
                  Text("/min", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons(bool rateConfigured, bool hasEnoughCoins) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          _buildPrimaryButton(rateConfigured, hasEnoughCoins),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              "Cancel",
              style: GoogleFonts.outfit(color: Colors.white38, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPrimaryButton(bool rateConfigured, bool hasEnoughCoins) {
    if (_loading) {
      return Container(
        height: 56,
        width: double.infinity,
        decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(16)),
        child: const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }

    final Color bgColor = !rateConfigured 
        ? Colors.white10 
        : (hasEnoughCoins ? const Color(0xFFD946EF) : const Color(0xFFF59E0B));

    return GestureDetector(
      onTap: () {
        if (!rateConfigured) return;
        if (hasEnoughCoins) {
          Navigator.pop(context);
          widget.onConfirm();
        } else {
          Navigator.pop(context);
          Navigator.pushNamed(context, '/recharge');
        }
      },
      child: Container(
        height: 56,
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: rateConfigured ? LinearGradient(
            colors: hasEnoughCoins 
                ? [const Color(0xFFD946EF), const Color(0xFF9333EA), const Color(0xFF6366F1)]
                : [const Color(0xFFF59E0B), const Color(0xFFEA580C)],
          ) : null,
          color: !rateConfigured ? Colors.white10 : null,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            if (rateConfigured)
              BoxShadow(color: bgColor.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 6))
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              !rateConfigured ? LucideIcons.x : (hasEnoughCoins ? LucideIcons.phoneCall : LucideIcons.gem),
              color: !rateConfigured ? Colors.white24 : Colors.white,
              size: 20,
            ),
            const SizedBox(width: 12),
            Text(
              !rateConfigured ? "Call Rate Not Set" : (hasEnoughCoins ? "Video Call" : "Recharge Now"),
              style: GoogleFonts.outfit(
                color: !rateConfigured ? Colors.white24 : Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

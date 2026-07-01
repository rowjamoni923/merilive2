import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'dart:math' as math;
import '../services/campaign_service.dart';
import 'recharge_campaign_popup.dart';

class RechargeCampaignFloatingButton extends StatefulWidget {
  const RechargeCampaignFloatingButton({super.key});

  @override
  State<RechargeCampaignFloatingButton> createState() => _RechargeCampaignFloatingButtonState();
}

class _RechargeCampaignFloatingButtonState extends State<RechargeCampaignFloatingButton> with SingleTickerProviderStateMixin {
  late AnimationController _rotationController;

  @override
  void initState() {
    super.initState();
    _rotationController = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
    
    // Initial fetch
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<CampaignService>(context, listen: false).init();
    });
  }

  @override
  void dispose() {
    _rotationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CampaignService>(
      builder: (context, service, child) {
        if (!service.isActive) return const SizedBox.shrink();

        final campaign = service.activeCampaign!;
        
        return GestureDetector(
          onTap: () => _showPopup(context, campaign),
          child: Container(
            margin: const EdgeInsets.only(bottom: 140, right: 10), // Above bottom nav - MOVED UP AS REQUESTED
            child: Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                // Animated Border
                RotationTransition(
                  turns: _rotationController,
                  child: Container(
                    width: 76, height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const SweepGradient(
                        colors: [Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFFEAB308), Color(0xFFF59E0B)],
                      ),
                    ),
                    padding: const EdgeInsets.all(3),
                    child: Container(
                      decoration: const BoxDecoration(color: Color(0xFF0F0A1A), shape: BoxShape.circle),
                    ),
                  ),
                ),
                
                // Static Image/Icon center
                Container(
                  width: 68, height: 68,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.amber.withOpacity(0.6), width: 2),
                    gradient: const RadialGradient(center: Alignment(-0.3, -0.3), colors: [Color(0xFF1A1028), Color(0xFF0A0612)]),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: campaign['banner_image_url'] != null 
                    ? Image.network(campaign['banner_image_url'], fit: BoxFit.cover)
                    : const Center(child: Text("💎", style: TextStyle(fontSize: 30))),
                ),
                
                // Countdown Badge
                Positioned(
                  top: -8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFFDC2626), Color(0xFFB91C1C)]),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [BoxShadow(color: Colors.red.withOpacity(0.5), blurRadius: 10)],
                    ),
                    child: Text(
                      _formatCountdown(service.remainingSeconds),
                      style: GoogleFonts.jetBrainsMono(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                
                // Sparkle particles (Subtle)
                _buildSmallParticle(-5, -5, Colors.yellow, 1.5, 0),
                _buildSmallParticle(70, 0, Colors.amber, 2.0, 0.5),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSmallParticle(double top, double left, Color color, double duration, double delay) {
    return Positioned(
      top: top, left: left,
      child: _PulseDot(color: color),
    );
  }

  void _showPopup(BuildContext context, Map<String, dynamic> campaign) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.8),
      builder: (ctx) => RechargeCampaignPopup(campaign: campaign),
    );
  }

  String _formatCountdown(int seconds) {
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    return "${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}";
  }
}

class _PulseDot extends StatefulWidget {
  final Color color;
  const _PulseDot({required this.color});

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat(reverse: true);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.4).animate(_ctrl),
      child: Container(
        width: 4, height: 4,
        decoration: BoxDecoration(color: widget.color.withOpacity(0.8), shape: BoxShape.circle),
      ),
    );
  }
}



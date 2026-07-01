import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:async';
import '../services/api_service.dart';

class LiveRoomTaskCenter extends StatefulWidget {
  final String hostId;
  final bool isHost;
  const LiveRoomTaskCenter({super.key, required this.hostId, required this.isHost});

  @override
  State<LiveRoomTaskCenter> createState() => _LiveRoomTaskCenterState();
}

class _LiveRoomTaskCenterState extends State<LiveRoomTaskCenter> {
  final ApiService _api = ApiService();
  Map<String, dynamic>? _state;
  bool _isCollapsed = false;
  bool _isClaiming = false;
  Timer? _heartbeatTimer;
  int? _showCelebration;

  @override
  void initState() {
    super.initState();
    _fetchState();
    if (widget.isHost) {
      _startHeartbeat();
    }
  }

  @override
  void dispose() {
    _heartbeatTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchState() async {
    final res = await _api.getHostLiveBonusState(widget.hostId);
    if (mounted) setState(() => _state = res);
  }

  void _startHeartbeat() {
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 60), (timer) async {
      final res = await _api.recordHostLiveMinute(widget.hostId);
      if (res['capped'] == true) {
        timer.cancel();
      }
      _fetchState();
    });
  }

  Future<void> _handleClaim(int hourNumber, int amount) async {
    setState(() => _isClaiming = true);
    final res = await _api.claimHostLiveHourBonus(widget.hostId, hourNumber);
    setState(() => _isClaiming = false);

    if (res['success'] == true) {
      setState(() => _showCelebration = amount);
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _showCelebration = null);
      });
      _fetchState();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_state == null || _state!['eligible'] != true) return const SizedBox();

    final List hours = _state!['hours'] ?? [];
    if (hours.isEmpty) return const SizedBox();

    final claimable = hours.firstWhere((h) => h['completed'] == true && h['claimed'] == false, orElse: () => null);
    final current = hours.firstWhere((h) => h['completed'] == false, orElse: () => null);

    return Stack(
      children: [
        if (_isCollapsed) _buildCollapsed(claimable != null) else _buildExpanded(hours, current, claimable),
        if (_showCelebration != null) _buildCelebration(),
      ],
    );
  }

  Widget _buildCollapsed(bool hasClaimable) {
    return Positioned(
      top: 140,
      right: 16,
      child: GestureDetector(
        onTap: () => setState(() => _isCollapsed = false),
        child: FadeInRight(
          child: Stack(
            children: [
              Container(
                width: 44, height: 44,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFEC4899)]),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.purpleAccent, blurRadius: 10)],
                ),
                child: const Icon(LucideIcons.flame, color: Colors.white, size: 22),
              ),
              if (hasClaimable)
                Positioned(
                  top: 0, right: 0,
                  child: ZoomIn(
                    child: Container(
                      width: 14, height: 14,
                      decoration: const BoxDecoration(color: Colors.amber, shape: BoxShape.circle),
                      child: const Center(child: Text("!", style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold))),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildExpanded(List hours, dynamic current, dynamic claimable) {
    return Positioned(
      top: 140,
      left: 16,
      child: FadeInLeft(
        child: Container(
          width: 280,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0F051E).withOpacity(0.95),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.purple.withOpacity(0.35)),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.6), blurRadius: 32)],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Container(
                    width: 28, height: 28,
                    decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF9333EA)]), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(LucideIcons.flame, color: Colors.white, size: 16),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text("New Host Bonus", style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(10)),
                              child: const Text("LIMITED", style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        Text("Day ${_state!['program_day']}/${_state!['program_days']} · Max 5h", style: TextStyle(color: Colors.purple.shade200.withOpacity(0.6), fontSize: 9)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => setState(() => _isCollapsed = true),
                    icon: const Icon(LucideIcons.x, color: Colors.white38, size: 14),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (current != null) ...[
                _buildProgressBar(current),
                const SizedBox(height: 12),
              ],
              _buildHourSlots(hours, current),
              const SizedBox(height: 12),
              _buildBottomActions(claimable),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProgressBar(dynamic current) {
    final int mins = current['minutes_accumulated'] ?? 0;
    final int left = (60 - mins).clamp(0, 60);
    return Container(
      height: 20,
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white10)),
      child: Stack(
        children: [
          FractionallySizedBox(
            widthFactor: (mins / 60).clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFA855F7), Color(0xFFEC4899), Color(0xFFF59E0B)]),
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(LucideIcons.clock, color: Colors.white70, size: 10),
                const SizedBox(width: 4),
                Text("Hour ${current['hour_number']}: $mins/60 min · ${left}m left", style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHourSlots(List hours, dynamic current) {
    return Row(
      children: hours.map((h) {
        final bool isClaimed = h['claimed'] == true;
        final bool isCompleted = h['completed'] == true;
        final bool isCurrent = current != null && current['hour_number'] == h['hour_number'];

        return Expanded(
          child: Container(
            height: 32,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              gradient: isClaimed ? const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF9333EA)]) : null,
              color: isClaimed ? null : (isCompleted ? Colors.amber.withOpacity(0.2) : (isCurrent ? Colors.purple.withOpacity(0.2) : Colors.white10)),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isCompleted ? Colors.amber.withOpacity(0.6) : Colors.white10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  isClaimed ? LucideIcons.check : (isCompleted ? LucideIcons.gift : LucideIcons.clock),
                  color: isClaimed ? Colors.white : (isCompleted ? Colors.amber : Colors.white24),
                  size: 14,
                ),
                Text("${h['hour_number']}h", style: TextStyle(color: isClaimed ? Colors.white : Colors.white38, fontSize: 7, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildBottomActions(dynamic claimable) {
    final earned = (_state!['hours'] as List).where((h) => h['claimed'] == true).fold(0, (sum, h) => sum + (h['bonus_beans'] as int));
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.zap, color: Colors.amber, size: 12),
                const SizedBox(width: 2),
                Text(earned.toString(), style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold, fontSize: 12)),
              ],
            ),
            const Text("Earned today", style: TextStyle(color: Colors.white24, fontSize: 7)),
          ],
        ),
        if (claimable != null)
          GestureDetector(
            onTap: () => _handleClaim(claimable['hour_number'], claimable['bonus_beans']),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFA855F7), Color(0xFFEC4899)]),
                borderRadius: BorderRadius.circular(12),
                boxShadow: const [BoxShadow(color: Colors.pinkAccent, blurRadius: 10)],
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.gift, color: Colors.white, size: 14),
                  const SizedBox(width: 6),
                  Text(
                    _isClaiming ? "..." : "Claim ${claimable['bonus_beans']}",
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          )
        else
           const Text("Keep Going!", style: TextStyle(color: Colors.white38, fontSize: 10, fontStyle: FontStyle.italic)),
      ],
    );
  }

  Widget _buildCelebration() {
    return Positioned.fill(
      child: Container(
        color: Colors.black54,
        child: Center(
          child: ZoomIn(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.sparkles, color: Colors.amber, size: 60),
                const SizedBox(height: 12),
                const Text("BONUS CLAIMED! 🎉", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                const SizedBox(height: 8),
                Text("+$_showCelebration Beans", style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold, fontSize: 24)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}



import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';

class RewardsScreen extends StatefulWidget {
  const RewardsScreen({super.key});

  @override
  State<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends State<RewardsScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  final int _currentDay = 3; // Mock day 3 out of 7

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
       vsync: this,
       duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Ambient Background Glows
          Positioned(
            top: -50, right: -50,
            child: Container(
              width: 300, height: 300,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x33F59E0B), boxShadow: [BoxShadow(color: Color(0x33F59E0B), blurRadius: 100)]),
            ),
          ),
          Positioned(
            bottom: -50, left: -50,
            child: Container(
              width: 250, height: 250,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x33EC4899), boxShadow: [BoxShadow(color: Color(0x33EC4899), blurRadius: 100)]),
            ),
          ),

          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Header
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white, size: 28),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 8),
                      Text("Rewards Center", style: GoogleFonts.inter(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                      const Spacer(),
                      // Total Coins Display
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.amber.withOpacity(0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.coins, color: Colors.amber, size: 16),
                            const SizedBox(width: 6),
                            Text("12,450", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                Expanded(
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 10),
                          
                          // Level Progress Hero Section
                          _buildLevelProgressCard(),
                          const SizedBox(height: 32),

                          // Daily Check-In
                          Text("Daily Check-In", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 16),
                          _buildDailyCheckIn(),
                          const SizedBox(height: 32),

                          // Daily Tasks Dashboard
                          Text("Daily Tasks", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 16),
                          _buildTaskItem(
                            icon: LucideIcons.video,
                            title: "Watch 3 Live Streams",
                            progress: "3/3",
                            progressRatio: 1.0,
                            reward: "50 Coins",
                            isCompleted: true,
                          ),
                          _buildTaskItem(
                            icon: LucideIcons.gift,
                            title: "Send a Gift",
                            progress: "0/1",
                            progressRatio: 0.0,
                            reward: "20 XP",
                            isCompleted: false,
                          ),
                          _buildTaskItem(
                            icon: LucideIcons.userPlus,
                            title: "Follow 2 Streamers",
                            progress: "1/2",
                            progressRatio: 0.5,
                            reward: "30 Coins",
                            isCompleted: false,
                          ),
                          _buildTaskItem(
                            icon: LucideIcons.mic2,
                            title: "Join a Party Room",
                            progress: "0/1",
                            progressRatio: 0.0,
                            reward: "100 XP",
                            isCompleted: false,
                          ),
                          const SizedBox(height: 40),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLevelProgressCard() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 20)],
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Current Level", style: GoogleFonts.inter(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFF3B82F6), borderRadius: BorderRadius.circular(8)),
                            child: Text("Lv.12", style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
                          ),
                          const SizedBox(width: 8),
                          Text("Rising Star", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ],
                  ),
                  const Icon(LucideIcons.star, color: Colors.amber, size: 40, shadows: [Shadow(color: Colors.amber, blurRadius: 15)]),
                ],
              ),
              const SizedBox(height: 24),
              // Neon Progress Bar
              Stack(
                alignment: Alignment.centerLeft,
                children: [
                  Container(
                    height: 12,
                    decoration: BoxDecoration(color: Colors.black.withOpacity(0.5), borderRadius: BorderRadius.circular(6)),
                  ),
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (context, child) {
                      return Transform.translate(
                        offset: Offset(0, _pulseController.value * -1),
                        child: Container(
                          width: MediaQuery.of(context).size.width * 0.45,
                          height: 12,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF8B5CF6)]),
                            borderRadius: BorderRadius.circular(6),
                            boxShadow: [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.6 + (_pulseController.value * 0.4)), blurRadius: 10)],
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("2,450 XP", style: GoogleFonts.inter(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                  Text("3,000 XP to Lv.13", style: GoogleFonts.inter(color: const Color(0xFF8B5CF6), fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDailyCheckIn() {
    return SizedBox(
      height: 110,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: 7,
        itemBuilder: (context, index) {
          final day = index + 1;
          final isPast = day < _currentDay;
          final isToday = day == _currentDay;
          final isFuture = day > _currentDay;

          return Container(
            width: 80,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: isPast ? Colors.white.withOpacity(0.05) : (isToday ? const Color(0xFFF59E0B).withOpacity(0.15) : Colors.white.withOpacity(0.02)),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isToday ? const Color(0xFFF59E0B) : Colors.white.withOpacity(0.05),
                width: isToday ? 2 : 1,
              ),
              boxShadow: isToday ? [BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.3), blurRadius: 12)] : [],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text("Day $day", style: GoogleFonts.inter(color: isToday ? Colors.amber : Colors.white54, fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (isPast)
                  const Icon(LucideIcons.checkCircle2, color: Color(0xFF10B981), size: 28)
                else if (day == 7) // Master Reward
                  const Icon(LucideIcons.gift, color: Color(0xFFD946EF), size: 28)
                else
                  const Icon(LucideIcons.coins, color: Colors.amber, size: 28),
                const SizedBox(height: 8),
                Text("+${day * 10}", style: GoogleFonts.inter(color: isPast ? const Color(0xFF10B981) : Colors.white70, fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTaskItem({required IconData icon, required String title, required String progress, required double progressRatio, required String reward, required bool isCompleted}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isCompleted ? const Color(0xFF10B981).withOpacity(0.1) : const Color(0xFFD946EF).withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: isCompleted ? const Color(0xFF10B981) : const Color(0xFFD946EF), size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.inter(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                      child: Text(reward, style: GoogleFonts.inter(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // Tiny Progress Bar
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(color: Colors.black.withOpacity(0.5), borderRadius: BorderRadius.circular(2)),
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: progressRatio,
                          child: Container(
                            decoration: BoxDecoration(
                              color: isCompleted ? const Color(0xFF10B981) : const Color(0xFF3B82F6),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(progress, style: GoogleFonts.inter(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.bold)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          // Action Button
          if (isCompleted)
             GestureDetector(
               onTap: () {}, // Claim action
               child: Container(
                 padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                 decoration: BoxDecoration(
                   gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)]),
                   borderRadius: BorderRadius.circular(16),
                   boxShadow: [BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.4), blurRadius: 10, offset: const Offset(0, 4))],
                 ),
                 child: Text("CLAIM", style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)),
               ),
             )
          else
             Container(
               padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
               decoration: BoxDecoration(
                 color: Colors.white.withOpacity(0.05),
                 borderRadius: BorderRadius.circular(16),
               ),
               child: Text("GO", style: GoogleFonts.inter(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.w900)),
             ),
        ],
      ),
    );
  }
}



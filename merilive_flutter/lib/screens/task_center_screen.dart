import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../utils/design_system.dart';

class TaskCenterScreen extends StatefulWidget {
  const TaskCenterScreen({super.key});

  @override
  State<TaskCenterScreen> createState() => _TaskCenterScreenState();
}

class _TaskCenterScreenState extends State<TaskCenterScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _tasks = [];
  Map<String, Map<String, dynamic>> _progress = {};
  Map<String, dynamic>? _bonusSettings;
  Map<String, dynamic>? _bonusProgress;
  bool _isEligibleForBonus = false;
  int _bonusDaysRemaining = 0;
  bool _isHost = false;
  String? _userId;

  // Animation States
  bool _showRewardOverlay = false;
  int _earnedBeans = 0;
  int _earnedDiamonds = 0;

  @override
  void initState() {
    super.initState();
    _userId = _api.currentUserId;
    _loadData();
    _setupRealtime();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      _isHost = profile?['is_host'] ?? false;

      // Check New Host Bonus Eligibility
      if (_isHost) {
        _bonusSettings = await _api.getNewHostBonusSettings();
        if (_bonusSettings != null && _bonusSettings!['is_active'] == true) {
          final createdAt = DateTime.parse(profile!['created_at']);
          final daysSince = DateTime.now().difference(createdAt).inDays;
          final eligibleDays = _bonusSettings!['eligible_days'] ?? 7;
          
          if (daysSince < eligibleDays) {
            _isEligibleForBonus = true;
            _bonusDaysRemaining = eligibleDays - daysSince;
            _bonusProgress = await _api.getNewHostBonusProgress();
          }
        }
      }

      // Load Daily Tasks & User Progress
      final results = await Future.wait([
        _api.getDailyTasks(),
        _api.getUserTaskProgress(),
      ]);

      _tasks = List<Map<String, dynamic>>.from(results[0]);
      final progressData = List<Map<String, dynamic>>.from(results[1]);
      
      _progress = {
        for (var p in progressData) p['task_id'].toString(): Map<String, dynamic>.from(p)
      };

      // Filter tasks by target_audience
      _tasks = _tasks.where((task) {
        final audience = task['target_audience'] ?? 'all';
        if (audience == 'host' && !_isHost) return false;
        if (audience == 'user' && _isHost) return false;
        
        // Special condition for 60min live tasks
        if (task['requirement_type'] == 'live_minutes' && (task['requirement_value'] ?? 0) >= 60) {
          return _isEligibleForBonus;
        }
        return true;
      }).toList();

    } catch (e) {
      debugPrint("Error loading tasks: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtime() {
    final supa = _api.getSupabase();
    supa.channel('tasks-realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'user_task_progress',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'user_id', value: _userId),
          callback: (payload) => _loadData(),
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: Stack(
        children: [
          // Background Glows
          Positioned(
            top: -100, right: -100,
            child: Container(width: 300, height: 300, decoration: BoxDecoration(color: Colors.amber.withOpacity(0.05), shape: BoxShape.circle, filter: ColorFilter.mode(Colors.amber.withOpacity(0.1), BlendMode.srcIn))),
          ),
          
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              _buildHeader(),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 20),
                      _buildSummaryCard(),
                      if (_isEligibleForBonus) ...[
                        const SizedBox(height: 24),
                        _buildNewHostBonusCard(),
                      ],
                      const SizedBox(height: 32),
                      _buildMissionTitle(),
                      const SizedBox(height: 16),
                      if (_isLoading)
                        _buildLoadingState()
                      else if (_tasks.isEmpty)
                        _buildEmptyState()
                      else
                        ..._tasks.map((task) => _buildTaskItem(task)).toList(),
                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Reward Overlay
          if (_showRewardOverlay)
            _buildRewardOverlay(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return SliverAppBar(
      expandedHeight: 140,
      pinned: true,
      backgroundColor: const Color(0xFF0F1015),
      elevation: 0,
      leading: IconButton(
        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      flexibleSpace: FlexibleSpaceBar(
        centerTitle: false,
        titlePadding: const EdgeInsets.only(left: 56, bottom: 20),
        title: Text(
          "Task Center",
          style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
        ),
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFF59E0B), Color(0xFFD97706), Color(0xFFB45309)],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -20, bottom: -20,
                child: Opacity(
                  opacity: 0.15,
                  child: const Icon(LucideIcons.star, size: 180, color: Colors.white),
                ),
              ),
              Positioned(
                left: 20, top: 40,
                child: FadeInLeft(child: const Icon(LucideIcons.sparkles, color: Colors.white38, size: 24)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSummaryCard() {
    final completed = _progress.values.where((p) => p['is_claimed'] == true).length;
    final total = _tasks.length;
    final progress = total > 0 ? (completed / total) : 0.0;

    return FadeInDown(
      duration: const Duration(milliseconds: 600),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF8B5CF6), Color(0xFF6366F1)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(32),
          boxShadow: [
            BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10)),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Daily Progress", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text("$completed/$total Tasks Completed", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 14)),
                  const SizedBox(height: 20),
                  Stack(
                    children: [
                      Container(height: 8, decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(10))),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 1000),
                        curve: Curves.easeOutBack,
                        height: 8,
                        width: (MediaQuery.of(context).size.width - 150) * progress,
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), boxShadow: [BoxShadow(color: Colors.white.withOpacity(0.5), blurRadius: 8)]),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), shape: BoxShape.circle),
              child: const Icon(LucideIcons.gift, color: Colors.white, size: 32),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNewHostBonusCard() {
    final int beansPerHour = _bonusSettings?['beans_per_hour'] ?? 0;
    final int maxHours = _bonusSettings?['max_hours_per_day'] ?? 0;
    final int hoursCompleted = _bonusProgress?['hours_completed'] ?? 0;

    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A24),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: const Color(0xFF8B5CF6).withOpacity(0.2)),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [const Color(0xFF1A0533), const Color(0xFF2D1B69).withOpacity(0.6)],
          ),
        ),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.fuchsiaAccent, Colors.purple]), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(LucideIcons.flame, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text("New Host Bonus", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          const SizedBox(width: 8),
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(8)), child: const Text("LIMITED", style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold))),
                        ],
                      ),
                      Text("$_bonusDaysRemaining days remaining", style: TextStyle(color: Colors.purple[200], fontSize: 11)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(NumberFormat('#,###').format(beansPerHour), style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold, fontSize: 18)),
                    const Text("beans/hr", style: TextStyle(color: Colors.white38, fontSize: 9)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(maxHours, (index) {
                final bool completed = hoursCompleted > index;
                return Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    height: 48,
                    decoration: BoxDecoration(
                      color: completed ? const Color(0xFF8B5CF6) : Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: completed ? Colors.white24 : Colors.white12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(completed ? LucideIcons.check : LucideIcons.clock, size: 14, color: completed ? Colors.white : Colors.white24),
                        const SizedBox(height: 2),
                        Text("${index + 1}h", style: TextStyle(fontSize: 8, color: completed ? Colors.white : Colors.white24, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: () => Navigator.pushNamed(context, '/go-live'),
                icon: const Icon(LucideIcons.video, size: 18),
                label: const Text("GO LIVE NOW"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF8B5CF6),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 8,
                  shadowColor: const Color(0xFF8B5CF6).withOpacity(0.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMissionTitle() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text("Daily Missions", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        TextButton(onPressed: _loadData, child: const Text("Refresh", style: TextStyle(color: Colors.amber, fontSize: 12))),
      ],
    );
  }

  Widget _buildTaskItem(Map<String, dynamic> task) {
    final String taskId = task['id'].toString();
    final taskProgress = _progress[taskId];
    final bool isCompleted = taskProgress?['is_completed'] ?? false;
    final bool isClaimed = taskProgress?['is_claimed'] ?? false;
    final int currentVal = taskProgress?['current_progress'] ?? 0;
    final int requiredVal = task['requirement_value'] ?? 1;
    final double percent = (currentVal / requiredVal).clamp(0.0, 1.0);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isClaimed ? Colors.green.withOpacity(0.05) : Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: isClaimed ? Colors.green.withOpacity(0.2) : (isCompleted ? Colors.amber.withOpacity(0.3) : Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        children: [
          _buildTaskIcon(task['icon_name'] ?? 'star', task['icon_color'] ?? '#FFD700'),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(task['title'] ?? "Mission", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                Text(task['description'] ?? "Complete to earn", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: percent,
                          backgroundColor: Colors.white.withOpacity(0.05),
                          valueColor: AlwaysStoppedAnimation(isCompleted ? Colors.amber : const Color(0xFF8B5CF6)),
                          minHeight: 4,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text("$currentVal/$requiredVal", style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if ((task['reward_beans'] ?? 0) > 0) _buildRewardChip("${task['reward_beans']} Beans", Colors.amber),
                    if ((task['reward_coins'] ?? 0) > 0) ...[
                      const SizedBox(width: 8),
                      _buildRewardChip("${task['reward_coins']} Diamonds", Colors.purpleAccent),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          _buildActionButton(taskId, isCompleted, isClaimed),
        ],
      ),
    );
  }

  Widget _buildTaskIcon(String name, String colorHex) {
    final Color color = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
    IconData iconData = LucideIcons.star;
    switch (name) {
      case 'video': iconData = LucideIcons.video; break;
      case 'clock': iconData = LucideIcons.clock; break;
      case 'users': iconData = LucideIcons.users; break;
      case 'gift': iconData = LucideIcons.gift; break;
      case 'message-circle': iconData = LucideIcons.messageCircle; break;
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
      child: Icon(iconData, color: color, size: 24),
    );
  }

  Widget _buildRewardChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildActionButton(String taskId, bool isCompleted, bool isClaimed) {
    if (isClaimed) {
      return Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.check, color: Colors.green, size: 20));
    }
    if (isCompleted) {
      return ElevatedButton(
        onPressed: () => _handleClaim(taskId),
        style: ElevatedButton.styleFrom(backgroundColor: Colors.amber, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
        child: const Text("CLAIM", style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11)),
      );
    }
    return OutlinedButton(
      onPressed: () {}, 
      style: OutlinedButton.styleFrom(foregroundColor: Colors.white70, side: const BorderSide(color: Colors.white10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      child: const Text("GO", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
    );
  }

  Future<void> _handleClaim(String taskId) async {
    try {
      final res = await _api.claimTaskReward(taskId);
      if (res['success'] == true) {
        setState(() {
          _earnedBeans = res['beans'] ?? 0;
          _earnedDiamonds = res['coins'] ?? 0;
          _showRewardOverlay = true;
        });
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['error'] ?? "Failed to claim reward")));
      }
    } catch (e) {
      debugPrint("Claim error: $e");
    }
  }

  Widget _buildRewardOverlay() {
    return Positioned.fill(
      child: Container(
        color: Colors.black.withOpacity(0.8),
        child: Center(
          child: ElasticIn(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.sparkles, color: Colors.amber, size: 100),
                const SizedBox(height: 24),
                Text("CONGRATULATIONS!", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2)),
                const SizedBox(height: 12),
                const Text("You've earned a reward", style: TextStyle(color: Colors.white60)),
                const SizedBox(height: 40),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (_earnedBeans > 0) _buildBigReward(_earnedBeans, "Beans", Colors.amber),
                    if (_earnedBeans > 0 && _earnedDiamonds > 0) const SizedBox(width: 40),
                    if (_earnedDiamonds > 0) _buildBigReward(_earnedDiamonds, "Diamonds", Colors.purpleAccent),
                  ],
                ),
                const SizedBox(height: 60),
                SizedBox(
                  width: 200,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: () => setState(() => _showRewardOverlay = false),
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8B5CF6), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
                    child: const Text("AWESOME!", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBigReward(int amount, String label, Color color) {
    return Column(
      children: [
        Text("+$amount", style: TextStyle(color: color, fontSize: 40, fontWeight: FontWeight.w900)),
        Text(label, style: TextStyle(color: color.withOpacity(0.6), fontSize: 14, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildLoadingState() {
    return const Center(child: Padding(padding: EdgeInsets.all(80), child: CircularProgressIndicator(color: Colors.amber)));
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 60),
          Icon(LucideIcons.calendar, size: 64, color: Colors.white.withOpacity(0.05)),
          const SizedBox(height: 16),
          Text("No missions today", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 16)),
        ],
      ),
    );
  }
}

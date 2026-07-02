import 'dart:async';
import 'package:flutter/material.dart';

/// Flutter port of `LiveTasksCard.tsx` — floating card during live stream
/// showing host daily/weekly tasks (Talk 30m, Get 100 gifts, etc.) with live
/// progress + reward chip. Server pushes progress; timers are cosmetic.
class LiveTask {
  final String id;
  final String title;
  final int progress;
  final int goal;
  final int rewardCoins;
  final Duration? remaining; // null = no expiry
  final bool completed;
  final bool claimed;
  const LiveTask({
    required this.id,
    required this.title,
    required this.progress,
    required this.goal,
    required this.rewardCoins,
    this.remaining,
    this.completed = false,
    this.claimed = false,
  });
}

class LiveTasksCard extends StatefulWidget {
  final List<LiveTask> tasks;
  final Future<void> Function(LiveTask task) onClaim;
  final VoidCallback? onClose;
  const LiveTasksCard({
    super.key,
    required this.tasks,
    required this.onClaim,
    this.onClose,
  });

  static Future<void> show(BuildContext context,
      {required List<LiveTask> tasks,
      required Future<void> Function(LiveTask) onClaim}) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => LiveTasksCard(
        tasks: tasks,
        onClaim: onClaim,
        onClose: () => Navigator.of(context).maybePop(),
      ),
    );
  }

  @override
  State<LiveTasksCard> createState() => _LiveTasksCardState();
}

class _LiveTasksCardState extends State<LiveTasksCard> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  String _fmt(Duration d) {
    if (d.isNegative) return '--:--';
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '${h.toString().padLeft(2, '0')}:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(top: 8, bottom: 8),
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Icon(Icons.emoji_events, color: Color(0xFFF59E0B), size: 20),
                SizedBox(width: 6),
                Text('Live tasks',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 420),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 8),
              shrinkWrap: true,
              itemBuilder: (_, i) => _row(widget.tasks[i]),
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemCount: widget.tasks.length,
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _row(LiveTask t) {
    final pct = t.goal == 0 ? 0.0 : (t.progress / t.goal).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: t.completed && !t.claimed
              ? const Color(0xFFF59E0B).withOpacity(0.5)
              : Colors.transparent,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(t.title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [
                    Color(0xFFF59E0B),
                    Color(0xFFEF4444),
                  ]),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.monetization_on,
                        color: Colors.white, size: 12),
                    const SizedBox(width: 3),
                    Text('${t.rewardCoins}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 6,
              backgroundColor: Colors.white.withOpacity(0.08),
              valueColor: const AlwaysStoppedAnimation(Color(0xFFEC4899)),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('${t.progress}/${t.goal}',
                  style: const TextStyle(color: Colors.white70, fontSize: 11)),
              const Spacer(),
              if (t.remaining != null)
                Text(_fmt(t.remaining!),
                    style: const TextStyle(
                        color: Colors.white54, fontSize: 11)),
              if (t.completed && !t.claimed) ...[
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () => widget.onClaim(t),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF59E0B),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 4),
                    minimumSize: const Size(0, 28),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999)),
                  ),
                  child: const Text('Claim',
                      style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w800)),
                ),
              ] else if (t.claimed) ...[
                const SizedBox(width: 8),
                const Icon(Icons.check_circle,
                    color: Color(0xFF22C55E), size: 16),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

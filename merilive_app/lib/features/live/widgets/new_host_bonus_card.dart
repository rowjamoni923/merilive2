import 'package:flutter/material.dart';

/// Flutter port of `NewHostBonusCard.tsx` — top-of-Go-Live celebratory card
/// for new hosts within their first 7 days. Shows current-week progress
/// (minutes streamed, Diamonds earned) toward tiered rewards.
class NewHostBonusMilestone {
  final String label;
  final int minutesGoal;
  final int rewardDiamonds;
  final bool achieved;
  const NewHostBonusMilestone({
    required this.label,
    required this.minutesGoal,
    required this.rewardDiamonds,
    this.achieved = false,
  });
}

class NewHostBonusCard extends StatelessWidget {
  final int daysLeft;
  final int minutesStreamed;
  final int diamondsEarned;
  final List<NewHostBonusMilestone> milestones;
  final VoidCallback? onDismiss;
  final VoidCallback? onLearnMore;

  const NewHostBonusCard({
    super.key,
    required this.daysLeft,
    required this.minutesStreamed,
    required this.diamondsEarned,
    required this.milestones,
    this.onDismiss,
    this.onLearnMore,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF8B5CF6),
            Color(0xFFEC4899),
            Color(0xFFF59E0B),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: const Color(0xFFEC4899).withOpacity(0.35),
              blurRadius: 24,
              offset: const Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.black26,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text('NEW HOST BONUS',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1)),
              ),
              const Spacer(),
              Text('$daysLeft days left',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
              if (onDismiss != null)
                IconButton(
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onDismiss,
                  icon: const Icon(Icons.close,
                      color: Colors.white70, size: 18),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _stat('$minutesStreamed', 'min streamed'),
              const SizedBox(width: 16),
              _stat('$diamondsEarned', 'Diamonds earned'),
            ],
          ),
          const SizedBox(height: 12),
          Column(
            children: milestones.map(_milestoneRow).toList(),
          ),
          if (onLearnMore != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onLearnMore,
                child: const Text('Learn more →',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stat(String v, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(v,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w900)),
        Text(label,
            style: const TextStyle(
                color: Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _milestoneRow(NewHostBonusMilestone m) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Icon(
              m.achieved
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked,
              color: m.achieved ? const Color(0xFFFDE68A) : Colors.white70,
              size: 16),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${m.label} · ${m.minutesGoal} min',
              style: TextStyle(
                  color: Colors.white.withOpacity(m.achieved ? 1 : 0.85),
                  fontSize: 12,
                  fontWeight: m.achieved ? FontWeight.w800 : FontWeight.w600,
                  decoration: m.achieved
                      ? TextDecoration.none
                      : TextDecoration.none),
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.monetization_on,
                  color: Color(0xFFFDE68A), size: 12),
              const SizedBox(width: 2),
              Text('${m.rewardDiamonds}',
                  style: const TextStyle(
                      color: Color(0xFFFDE68A),
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
            ],
          ),
        ],
      ),
    );
  }
}

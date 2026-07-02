import 'package:flutter/material.dart';

/// Flutter port of `CoHostPanel.tsx` — host-only bottom sheet listing
/// current co-hosts + pending join requests. Approve/decline requests,
/// mute/kick active co-hosts.
class CoHostSlot {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int level;
  final bool micOn;
  final bool speaking;
  const CoHostSlot({
    required this.userId,
    required this.name,
    required this.level,
    this.avatarUrl,
    this.micOn = true,
    this.speaking = false,
  });
}

class CoHostRequest {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int level;
  const CoHostRequest({
    required this.userId,
    required this.name,
    required this.level,
    this.avatarUrl,
  });
}

class CoHostPanel extends StatelessWidget {
  final List<CoHostSlot> active;
  final List<CoHostRequest> pending;
  final int maxSlots;
  final void Function(CoHostRequest r) onApprove;
  final void Function(CoHostRequest r) onDecline;
  final void Function(CoHostSlot s) onMute;
  final void Function(CoHostSlot s) onKick;

  const CoHostPanel({
    super.key,
    required this.active,
    required this.pending,
    required this.onApprove,
    required this.onDecline,
    required this.onMute,
    required this.onKick,
    this.maxSlots = 8,
  });

  static Future<void> show(
    BuildContext context, {
    required List<CoHostSlot> active,
    required List<CoHostRequest> pending,
    required void Function(CoHostRequest) onApprove,
    required void Function(CoHostRequest) onDecline,
    required void Function(CoHostSlot) onMute,
    required void Function(CoHostSlot) onKick,
    int maxSlots = 8,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => CoHostPanel(
        active: active,
        pending: pending,
        onApprove: onApprove,
        onDecline: onDecline,
        onMute: onMute,
        onKick: onKick,
        maxSlots: maxSlots,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DefaultTabController(
          length: 2,
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
              TabBar(
                indicatorColor: const Color(0xFFEC4899),
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white54,
                tabs: [
                  Tab(text: 'Active (${active.length}/$maxSlots)'),
                  Tab(text: 'Requests (${pending.length})'),
                ],
              ),
              SizedBox(
                height: 380,
                child: TabBarView(
                  children: [
                    _activeList(),
                    _pendingList(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _activeList() {
    if (active.isEmpty) {
      return const Center(
        child: Text('No co-hosts on stage',
            style: TextStyle(color: Colors.white54)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      itemBuilder: (_, i) {
        final s = active[i];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: const Color(0xFF1E293B),
                backgroundImage:
                    (s.avatarUrl != null && s.avatarUrl!.isNotEmpty)
                        ? NetworkImage(s.avatarUrl!)
                        : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13)),
                    Text('Lv ${s.level}',
                        style: const TextStyle(
                            color: Colors.white54, fontSize: 11)),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => onMute(s),
                icon: Icon(s.micOn ? Icons.mic : Icons.mic_off,
                    color: s.micOn ? Colors.white : Colors.redAccent),
              ),
              IconButton(
                onPressed: () => onKick(s),
                icon: const Icon(Icons.remove_circle_outline,
                    color: Color(0xFFEF4444)),
              ),
            ],
          ),
        );
      },
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemCount: active.length,
    );
  }

  Widget _pendingList() {
    if (pending.isEmpty) {
      return const Center(
        child: Text('No pending requests',
            style: TextStyle(color: Colors.white54)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      itemBuilder: (_, i) {
        final r = pending[i];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: const Color(0xFF1E293B),
                backgroundImage:
                    (r.avatarUrl != null && r.avatarUrl!.isNotEmpty)
                        ? NetworkImage(r.avatarUrl!)
                        : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13)),
                    Text('Lv ${r.level}',
                        style: const TextStyle(
                            color: Colors.white54, fontSize: 11)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => onDecline(r),
                child: const Text('Decline',
                    style: TextStyle(color: Colors.white54)),
              ),
              ElevatedButton(
                onPressed: active.length >= maxSlots ? null : () => onApprove(r),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEC4899),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999)),
                ),
                child: const Text('Accept'),
              ),
            ],
          ),
        );
      },
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemCount: pending.length,
    );
  }
}

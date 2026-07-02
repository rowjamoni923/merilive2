import 'package:flutter/material.dart';

import '../data/live_raise_hand_bridge.dart';

/// H3 — Host-side FIFO queue sheet. Mirrors web `RaiseHandQueueSheet`.
///
/// The sheet subscribes to `LiveRaiseHandBridge.watch(streamId)` and
/// renders pending viewers with Approve / Reject actions. Approving
/// only resolves the queue row — actual seat promotion is delegated to
/// the existing multi-guest / seat flow (host taps the viewer chip).
class LiveRaiseHandQueueSheet extends StatelessWidget {
  final String streamId;
  const LiveRaiseHandQueueSheet({super.key, required this.streamId});

  static Future<void> show(BuildContext context, String streamId) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF161822),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => LiveRaiseHandQueueSheet(streamId: streamId),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: FractionallySizedBox(
        heightFactor: 0.7,
        child: Column(
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(top: 8, bottom: 12),
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Icon(Icons.pan_tool, color: Colors.amber, size: 20),
                  SizedBox(width: 8),
                  Text('Raise-hand queue',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: StreamBuilder<List<RaiseHandEntry>>(
                stream: LiveRaiseHandBridge.instance.watch(streamId),
                builder: (context, snap) {
                  final list = snap.data ?? const <RaiseHandEntry>[];
                  if (list.isEmpty) {
                    return const Center(
                      child: Text(
                        'No one has raised their hand yet',
                        style: TextStyle(color: Colors.white54),
                      ),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const Divider(
                        color: Colors.white10, height: 1),
                    itemBuilder: (context, i) {
                      final e = list[i];
                      return _QueueRow(entry: e, index: i + 1);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QueueRow extends StatefulWidget {
  final RaiseHandEntry entry;
  final int index;
  const _QueueRow({required this.entry, required this.index});

  @override
  State<_QueueRow> createState() => _QueueRowState();
}

class _QueueRowState extends State<_QueueRow> {
  bool _busy = false;

  Future<void> _act(Future<bool> Function() fn) async {
    if (_busy) return;
    setState(() => _busy = true);
    await fn();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 22,
            child: Text('${widget.index}',
                style: const TextStyle(
                    color: Colors.white54, fontWeight: FontWeight.w600)),
          ),
          CircleAvatar(
            radius: 18,
            backgroundColor: Colors.white10,
            backgroundImage:
                e.viewerAvatar != null ? NetworkImage(e.viewerAvatar!) : null,
            child: e.viewerAvatar == null
                ? const Icon(Icons.person, size: 18, color: Colors.white54)
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.viewerName ?? 'Viewer',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
                if (e.reason != null && e.reason!.isNotEmpty)
                  Text(
                    e.reason!,
                    style: const TextStyle(
                        color: Colors.white54, fontSize: 11),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          IconButton(
            onPressed: _busy
                ? null
                : () => _act(
                    () => LiveRaiseHandBridge.instance.reject(e)),
            icon: const Icon(Icons.close, color: Colors.redAccent, size: 20),
          ),
          IconButton(
            onPressed: _busy
                ? null
                : () => _act(
                    () => LiveRaiseHandBridge.instance.approve(e)),
            icon: const Icon(Icons.check_circle,
                color: Colors.greenAccent, size: 22),
          ),
        ],
      ),
    );
  }
}

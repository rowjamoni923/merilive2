import 'package:flutter/material.dart';

/// Flutter port of `PKBattlePanel.tsx` — host-side control panel before a
/// battle starts. Choose duration (3/5/10 min), start random match, or
/// invite a specific host by id. Backed by server RPC `request_pk_match`.
class PKBattlePanel extends StatefulWidget {
  final Future<void> Function(int minutes) onStartRandom;
  final Future<void> Function(int minutes, String targetHostId) onInviteHost;
  final VoidCallback? onCancelQueue;
  final bool inQueue;

  const PKBattlePanel({
    super.key,
    required this.onStartRandom,
    required this.onInviteHost,
    this.onCancelQueue,
    this.inQueue = false,
  });

  static Future<void> show(
    BuildContext context, {
    required Future<void> Function(int) onStartRandom,
    required Future<void> Function(int, String) onInviteHost,
    VoidCallback? onCancelQueue,
    bool inQueue = false,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => PKBattlePanel(
        onStartRandom: onStartRandom,
        onInviteHost: onInviteHost,
        onCancelQueue: onCancelQueue,
        inQueue: inQueue,
      ),
    );
  }

  @override
  State<PKBattlePanel> createState() => _PKBattlePanelState();
}

class _PKBattlePanelState extends State<PKBattlePanel> {
  int _minutes = 5;
  final _targetCtl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _targetCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 12,
          bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2)),
            ),
            const Text('PK Battle',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900)),
            const SizedBox(height: 16),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Duration',
                  style: TextStyle(color: Colors.white70, fontSize: 12)),
            ),
            const SizedBox(height: 6),
            Row(children: [3, 5, 10].map(_durBtn).toList()),
            const SizedBox(height: 20),
            if (widget.inQueue) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Color(0xFFEC4899)),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text('Searching for opponent…',
                          style: TextStyle(color: Colors.white)),
                    ),
                    TextButton(
                      onPressed: widget.onCancelQueue,
                      child: const Text('Cancel',
                          style: TextStyle(color: Color(0xFFEF4444))),
                    ),
                  ],
                ),
              ),
            ] else ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _busy
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          try {
                            await widget.onStartRandom(_minutes);
                            if (mounted) Navigator.of(context).pop();
                          } finally {
                            if (mounted) setState(() => _busy = false);
                          }
                        },
                  icon: const Icon(Icons.shuffle),
                  label: const Text('Random match'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _targetCtl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Invite host by ID',
                  hintStyle: const TextStyle(color: Colors.white38),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.06),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.send, color: Color(0xFFEC4899)),
                    onPressed: _busy || _targetCtl.text.trim().isEmpty
                        ? null
                        : () async {
                            setState(() => _busy = true);
                            try {
                              await widget.onInviteHost(
                                  _minutes, _targetCtl.text.trim());
                              if (mounted) Navigator.of(context).pop();
                            } finally {
                              if (mounted) setState(() => _busy = false);
                            }
                          },
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _durBtn(int m) {
    final active = _minutes == m;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(right: 6),
        child: GestureDetector(
          onTap: () => setState(() => _minutes = m),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: active
                  ? const Color(0xFFEF4444)
                  : Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text('$m min',
                style: TextStyle(
                    color: active ? Colors.white : Colors.white70,
                    fontWeight: FontWeight.w800)),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../data/live_raise_hand_bridge.dart';

/// H3 — Viewer-side raise-hand CTA. Toggles between "Raise hand" and
/// "Lower hand" states, mirrors the web `PartyRaiseHandUI` semantics.
class LiveRaiseHandButton extends StatefulWidget {
  final String streamId;
  const LiveRaiseHandButton({super.key, required this.streamId});

  @override
  State<LiveRaiseHandButton> createState() => _LiveRaiseHandButtonState();
}

class _LiveRaiseHandButtonState extends State<LiveRaiseHandButton> {
  bool _raised = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final r = await LiveRaiseHandBridge.instance
        .isRaised(streamId: widget.streamId);
    if (mounted) setState(() => _raised = r);
  }

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    final b = LiveRaiseHandBridge.instance;
    final ok = _raised
        ? await b.lower(streamId: widget.streamId)
        : await b.raise(streamId: widget.streamId);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) _raised = !_raised;
    });
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_raised ? 'Hand raised' : 'Hand lowered'),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _toggle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: _raised
              ? Colors.amber.withOpacity(0.9)
              : Colors.white.withOpacity(0.15),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.white.withOpacity(0.25),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _raised ? Icons.pan_tool : Icons.pan_tool_outlined,
              color: Colors.white,
              size: 16,
            ),
            const SizedBox(width: 6),
            Text(
              _raised ? 'Raised' : 'Raise hand',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

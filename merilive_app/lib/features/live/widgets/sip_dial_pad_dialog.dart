import 'package:flutter/material.dart';

/// Flutter port of `SipDialPadDialog.tsx` — host-only dialog to place a SIP
/// call into the LiveKit room (PSTN bridge). Simple E.164 keypad + call.
class SipDialPadDialog extends StatefulWidget {
  final Future<void> Function(String e164) onDial;
  const SipDialPadDialog({super.key, required this.onDial});

  static Future<void> show(
      BuildContext context, Future<void> Function(String) onDial) {
    return showDialog(
      context: context,
      builder: (_) => SipDialPadDialog(onDial: onDial),
    );
  }

  @override
  State<SipDialPadDialog> createState() => _SipDialPadDialogState();
}

class _SipDialPadDialogState extends State<SipDialPadDialog> {
  final _num = StringBuffer('+');
  bool _busy = false;

  void _tap(String d) {
    setState(() => _num.write(d));
  }

  void _back() {
    if (_num.length <= 1) return;
    final s = _num.toString();
    _num.clear();
    _num.write(s.substring(0, s.length - 1));
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Dial SIP',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      content: SizedBox(
        width: 300,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(_num.toString(),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w700)),
                  ),
                  IconButton(
                    onPressed: _back,
                    icon: const Icon(Icons.backspace_outlined,
                        color: Colors.white70),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: const [
                '1','2','3','4','5','6','7','8','9','*','0','#'
              ].map(_pad).toList(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(color: Colors.white54)),
        ),
        ElevatedButton.icon(
          onPressed: _busy || _num.length < 4
              ? null
              : () async {
                  setState(() => _busy = true);
                  try {
                    await widget.onDial(_num.toString());
                    if (mounted) Navigator.of(context).pop();
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          icon: const Icon(Icons.call),
          label: Text(_busy ? 'Dialing…' : 'Call'),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF22C55E),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999)),
          ),
        ),
      ],
    );
  }

  Widget _pad(String d) {
    return GestureDetector(
      onTap: () => _tap(d),
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(d,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700)),
      ),
    );
  }
}

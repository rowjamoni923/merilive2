import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Room-code quick-join dialog — parity with `Discover.tsx`.
class RoomCodeDialog extends StatefulWidget {
  const RoomCodeDialog({super.key, required this.onSubmit});

  final Future<void> Function(String code) onSubmit;

  @override
  State<RoomCodeDialog> createState() => _RoomCodeDialogState();
}

class _RoomCodeDialogState extends State<RoomCodeDialog> {
  final _controller = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _controller.text.trim().toUpperCase();
    if (code.isEmpty) return;
    setState(() => _busy = true);
    try {
      await widget.onSubmit(code);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [
                      Color(0xFF6366F1),
                      Color(0xFFA855F7),
                    ]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.vpn_key_rounded,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Join by room code',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded,
                      color: Color(0xFF64748B)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Enter the 6-character room code shared with you.',
              style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                LengthLimitingTextInputFormatter(8),
                FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
              ],
              style: const TextStyle(
                fontSize: 20,
                letterSpacing: 6,
                fontWeight: FontWeight.w800,
                color: Color(0xFF0F172A),
              ),
              textAlign: TextAlign.center,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                hintText: 'ABC123',
                hintStyle: const TextStyle(
                  letterSpacing: 6,
                  color: Color(0xFFCBD5E1),
                  fontWeight: FontWeight.w700,
                ),
                filled: true,
                fillColor: const Color(0xFFF8FAFC),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(
                      color: Color(0xFF6366F1), width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _busy ? null : _submit,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  elevation: 0,
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [
                      Color(0xFF6366F1),
                      Color(0xFFA855F7),
                    ]),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: SizedBox(
                    height: 48,
                    child: Center(
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Join room',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

/// Flutter port of `HostCallReturnModal.tsx` — modal shown when host returns
/// from a private call, prompting to resume the live stream immediately or
/// end it. Auto-selects "Resume" after 15s if untouched (matches web).
class HostCallReturnModal extends StatefulWidget {
  final VoidCallback onResume;
  final VoidCallback onEnd;
  final int autoResumeSeconds;

  const HostCallReturnModal({
    super.key,
    required this.onResume,
    required this.onEnd,
    this.autoResumeSeconds = 15,
  });

  static Future<void> show(
    BuildContext context, {
    required VoidCallback onResume,
    required VoidCallback onEnd,
  }) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => HostCallReturnModal(onResume: onResume, onEnd: onEnd),
    );
  }

  @override
  State<HostCallReturnModal> createState() => _HostCallReturnModalState();
}

class _HostCallReturnModalState extends State<HostCallReturnModal> {
  late int _left;

  @override
  void initState() {
    super.initState();
    _left = widget.autoResumeSeconds;
    _tick();
  }

  void _tick() {
    if (!mounted) return;
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      if (_left <= 1) {
        Navigator.of(context).pop();
        widget.onResume();
        return;
      }
      setState(() => _left--);
      _tick();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Return to live stream?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      content: Text(
        'You\'re back from a private call. Resume the live stream so viewers can continue watching. Auto-resuming in $_left s.',
        style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 13),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.of(context).pop();
            widget.onEnd();
          },
          child: const Text('End stream',
              style: TextStyle(color: Color(0xFFEF4444))),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.of(context).pop();
            widget.onResume();
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFEC4899),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          child: Text('Resume ($_left)'),
        ),
      ],
    );
  }
}

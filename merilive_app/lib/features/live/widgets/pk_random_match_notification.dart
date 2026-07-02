import 'package:flutter/material.dart';

/// Flutter port of `PKRandomMatchNotification.tsx` — small toast shown while
/// PK random matchmaking is searching. Auto-updates elapsed time. Cancel
/// button.
class PKRandomMatchNotification extends StatefulWidget {
  final DateTime startedAt;
  final VoidCallback onCancel;
  const PKRandomMatchNotification({
    super.key,
    required this.startedAt,
    required this.onCancel,
  });

  @override
  State<PKRandomMatchNotification> createState() =>
      _PKRandomMatchNotificationState();
}

class _PKRandomMatchNotificationState
    extends State<PKRandomMatchNotification> {
  @override
  void initState() {
    super.initState();
    _tick();
  }

  void _tick() {
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      setState(() {});
      _tick();
    });
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(widget.startedAt).inSeconds;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [
          Color(0xFFEF4444),
          Color(0xFFEC4899),
        ]),
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
              color: const Color(0xFFEF4444).withOpacity(0.5),
              blurRadius: 18,
              spreadRadius: 1),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Text('Matching PK · ${elapsed}s',
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: widget.onCancel,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black26,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('Cancel',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

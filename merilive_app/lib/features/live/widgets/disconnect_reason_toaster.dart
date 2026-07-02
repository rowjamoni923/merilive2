// Pkg202 parity — LiveKit disconnect-reason global toaster.
//
// Flutter port of `src/components/live/DisconnectReasonToaster.tsx`. Pure
// listener; the underlying LiveKit bridge emits [LiveDisconnectEvent]s on
// [LiveDisconnectBus]. Silent reasons (client-initiated, migration) are
// skipped. Mount once high in the widget tree of any screen that hosts a
// LiveKit room; it captures the current [ScaffoldMessenger] and shows a
// SnackBar per the event severity.

import 'dart:async';
import 'package:flutter/material.dart';

enum LiveDisconnectSeverity { info, warning, error }

class LiveDisconnectEvent {
  const LiveDisconnectEvent({
    required this.title,
    required this.message,
    this.severity = LiveDisconnectSeverity.info,
    this.silent = false,
    this.isFinal = false,
  });

  final String title;
  final String message;
  final LiveDisconnectSeverity severity;
  final bool silent;
  final bool isFinal;
}

class LiveDisconnectBus {
  LiveDisconnectBus._();
  static final LiveDisconnectBus instance = LiveDisconnectBus._();
  final StreamController<LiveDisconnectEvent> _ctrl =
      StreamController<LiveDisconnectEvent>.broadcast();
  Stream<LiveDisconnectEvent> get stream => _ctrl.stream;
  void emit(LiveDisconnectEvent e) => _ctrl.add(e);
}

class DisconnectReasonToaster extends StatefulWidget {
  const DisconnectReasonToaster({super.key, required this.child});
  final Widget child;

  @override
  State<DisconnectReasonToaster> createState() =>
      _DisconnectReasonToasterState();
}

class _DisconnectReasonToasterState extends State<DisconnectReasonToaster> {
  StreamSubscription<LiveDisconnectEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = LiveDisconnectBus.instance.stream.listen(_show);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _show(LiveDisconnectEvent e) {
    if (!mounted || e.silent) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    Color bg;
    IconData icon;
    switch (e.severity) {
      case LiveDisconnectSeverity.error:
        bg = const Color(0xFFDC2626);
        icon = Icons.error_outline_rounded;
        break;
      case LiveDisconnectSeverity.warning:
        bg = const Color(0xFFF59E0B);
        icon = Icons.warning_amber_rounded;
        break;
      case LiveDisconnectSeverity.info:
        bg = const Color(0xFF1F2937);
        icon = Icons.info_outline_rounded;
        break;
    }
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: bg,
        behavior: SnackBarBehavior.floating,
        duration: Duration(milliseconds: e.isFinal ? 6000 : 3500),
        content: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (e.message.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        e.message,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

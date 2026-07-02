import 'dart:async';

import 'package:flutter/material.dart';

import '../../live/data/live_chat_bridge.dart' show LiveGiftEvent;
import '../data/party_gift_bridge.dart';

/// G19 — Gift combo tracker overlay.
///
/// Chamet/Bigo-style x2 x3 x5 combo counter that appears in the top-right
/// when the same sender fires the same gift within a 4s window. Auto-hides
/// 2.5s after the last hit.
class PartyGiftComboTracker extends StatefulWidget {
  const PartyGiftComboTracker({super.key});

  @override
  State<PartyGiftComboTracker> createState() => _PartyGiftComboTrackerState();
}

class _PartyGiftComboTrackerState extends State<PartyGiftComboTracker>
    with SingleTickerProviderStateMixin {
  StreamSubscription<LiveGiftEvent>? _sub;
  Timer? _fade;
  String? _key;
  int _combo = 0;
  String _giftName = '';
  String _senderName = '';

  @override
  void initState() {
    super.initState();
    _sub = PartyGiftBridge.instance.gifts$.listen(_onGift);
  }

  void _onGift(LiveGiftEvent e) {
    final k = '${e.senderId ?? ''}:${e.giftId ?? ''}';
    setState(() {
      if (k == _key) {
        _combo += e.quantity;
      } else {
        _key = k;
        _combo = e.quantity;
      }
      _giftName = e.giftName;
      _senderName = e.senderName;
    });
    _fade?.cancel();
    _fade = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() {
        _key = null;
        _combo = 0;
      });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _fade?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _combo > 1 && _key != null;
    return AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 220),
      child: IgnorePointer(
        ignoring: !visible,
        child: Padding(
          padding: const EdgeInsets.only(right: 12, top: 4),
          child: Align(
            alignment: Alignment.topRight,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [
                  Color(0xFFF59E0B),
                  Color(0xFFEF4444),
                ]),
                borderRadius: BorderRadius.circular(999),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.4),
                    blurRadius: 6,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.flash_on_rounded,
                      color: Colors.white, size: 14),
                  const SizedBox(width: 4),
                  Text('$_senderName × $_combo $_giftName',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

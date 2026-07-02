import 'dart:async';
import 'package:flutter/material.dart';

import '../data/live_chat_bridge.dart';

/// A2 — Top-left gift ticker. Shows the most-recent 3 gift events,
/// each auto-dismissing after ~4 seconds. Purely presentational —
/// full-screen VAP/SVGA animations remain on the native path.
class LiveGiftFeed extends StatefulWidget {
  const LiveGiftFeed({super.key, required this.stream});
  final Stream<LiveGiftEvent> stream;

  @override
  State<LiveGiftFeed> createState() => _LiveGiftFeedState();
}

class _LiveGiftFeedState extends State<LiveGiftFeed> {
  final List<LiveGiftEvent> _items = [];
  StreamSubscription<LiveGiftEvent>? _sub;
  static const int _max = 3;

  @override
  void initState() {
    super.initState();
    _sub = widget.stream.listen(_onGift);
  }

  void _onGift(LiveGiftEvent g) {
    setState(() {
      _items.insert(0, g);
      if (_items.length > _max) _items.removeRange(_max, _items.length);
    });
    Future.delayed(const Duration(seconds: 4), () {
      if (!mounted) return;
      setState(() => _items.remove(g));
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: _items
          .map((g) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: _GiftPill(event: g),
              ))
          .toList(),
    );
  }
}

class _GiftPill extends StatelessWidget {
  const _GiftPill({required this.event});
  final LiveGiftEvent event;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: const EdgeInsets.fromLTRB(6, 4, 12, 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [
          Color(0xCCF59E0B),
          Color(0xCCEC4899),
        ]),
        borderRadius: BorderRadius.circular(30),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: Colors.white24,
            backgroundImage: (event.senderAvatar != null &&
                    event.senderAvatar!.isNotEmpty)
                ? NetworkImage(event.senderAvatar!)
                : null,
            child: (event.senderAvatar == null || event.senderAvatar!.isEmpty)
                ? const Icon(Icons.person, size: 14, color: Colors.white)
                : null,
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                event.senderName,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                'sent ${event.giftName} x${event.quantity}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10.5,
                ),
              ),
            ],
          ),
          const SizedBox(width: 10),
          if (event.giftIcon != null && event.giftIcon!.isNotEmpty)
            Image.network(
              event.giftIcon!,
              width: 26,
              height: 26,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.card_giftcard, size: 22, color: Colors.white),
            )
          else
            const Icon(Icons.card_giftcard, size: 22, color: Colors.white),
        ],
      ),
    );
  }
}

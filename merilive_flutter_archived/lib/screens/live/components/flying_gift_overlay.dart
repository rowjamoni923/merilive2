import 'package:flutter/material.dart';
import 'dart:async';
import '../../../theme/app_theme.dart';

class FlyingGiftOverlay extends StatefulWidget {
  final Map<String, dynamic> giftData;
  final VoidCallback onComplete;

  const FlyingGiftOverlay({super.key, required this.giftData, required this.onComplete});

  @override
  State<FlyingGiftOverlay> createState() => _FlyingGiftOverlayState();
}

class _FlyingGiftOverlayState extends State<FlyingGiftOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _slideAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 3000));
    
    _slideAnimation = Tween<double>(begin: 0.0, end: 100.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.8, curve: Curves.easeOut)),
    );

    _opacityAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 10),
      TweenSequenceItem(tween: ConstantTween(1.0), weight: 80),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 10),
    ]).animate(_controller);

    _controller.forward().then((_) => widget.onComplete());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final senderName = widget.giftData['senderName'] ?? "User";
    final giftName = widget.giftData['giftName'] ?? "Gift";
    final giftIcon = widget.giftData['giftIconUrl'] ?? "";
    final count = widget.giftData['count'] ?? 1;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Positioned(
          bottom: 250 + _slideAnimation.value,
          left: 16,
          child: Opacity(
            opacity: _opacityAnimation.value,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.primaryPink.withOpacity(0.8), Colors.black54],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
                borderRadius: BorderRadius.circular(25),
                border: Border.all(color: Colors.white24),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 14, backgroundColor: Colors.white10, backgroundImage: NetworkImage(widget.giftData['senderAvatar'] ?? '')),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(senderName, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      Text("Sent $giftName", style: const TextStyle(color: Colors.white70, fontSize: 10)),
                    ],
                  ),
                  const SizedBox(width: 10),
                  if (giftIcon.isNotEmpty)
                    Image.network(giftIcon, width: 30, height: 30)
                  else
                    const Icon(Icons.card_giftcard, color: Colors.amber, size: 24),
                  const SizedBox(width: 5),
                  Text("x$count", style: const TextStyle(color: Colors.amber, fontSize: 20, fontWeight: FontWeight.bold, fontStyle: FontStyle.italic)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

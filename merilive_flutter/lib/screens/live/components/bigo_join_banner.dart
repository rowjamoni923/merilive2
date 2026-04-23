import 'package:flutter/material.dart';
import '../../../theme/app_theme.dart';

class BigoJoinBanner extends StatefulWidget {
  final Map<String, dynamic> userData;
  final VoidCallback onComplete;

  const BigoJoinBanner({super.key, required this.userData, required this.onComplete});

  @override
  State<BigoJoinBanner> createState() => _BigoJoinBannerState();
}

class _BigoJoinBannerState extends State<BigoJoinBanner> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 2500));
    
    _slideAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: -300.0, end: 16.0).chain(CurveTween(curve: Curves.easeOutBack)), weight: 20),
      TweenSequenceItem(tween: ConstantTween(16.0), weight: 60),
      TweenSequenceItem(tween: Tween(begin: 16.0, end: 500.0).chain(CurveTween(curve: Curves.easeInBack)), weight: 20),
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
    final userName = widget.userData['userName'] ?? "User";
    final userLevel = widget.userData['userLevel'] ?? 1;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Positioned(
          bottom: 200,
          left: _slideAnimation.value,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF22C55E), Colors.black54],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.greenAccent.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(10)),
                  child: Text("Lv.$userLevel", style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 8),
                Text(userName, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(width: 4),
                const Text("entered the room", style: TextStyle(color: Colors.white70, fontSize: 10)),
              ],
            ),
          ),
        );
      },
    );
  }
}

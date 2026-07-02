import 'package:flutter/material.dart';

/// Flutter port of `PrewarmDiv.tsx` — offscreen prewarm helper that keeps
/// SurfaceViewRenderer + JS heap warm for the next Go Live / join.
/// Renders an invisible 1×1 container that mounts a `Placeholder` so the
/// GPU/JIT stays hot. Consumers mount this once in the app root.
class PrewarmDiv extends StatelessWidget {
  final bool active;
  const PrewarmDiv({super.key, this.active = true});

  @override
  Widget build(BuildContext context) {
    if (!active) return const SizedBox.shrink();
    return const IgnorePointer(
      child: SizedBox(
        width: 1,
        height: 1,
        child: Opacity(
          opacity: 0.001,
          child: RepaintBoundary(child: Placeholder(strokeWidth: 0.1)),
        ),
      ),
    );
  }
}

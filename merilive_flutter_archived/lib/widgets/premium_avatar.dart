import 'package:flutter/material.dart';
import 'avatar_with_frame.dart';

class PremiumAvatar extends StatelessWidget {
  final String imageUrl;
  final double size;
  final String? frameId;

  const PremiumAvatar({
    super.key,
    required this.imageUrl,
    this.size = 100,
    this.frameId,
  });

  @override
  Widget build(BuildContext context) {
    // Wrapper around AvatarWithFrame to match the expected signature in other screens
    return AvatarWithFrame(
      src: imageUrl,
      size: size,
      frameId: frameId,
    );
  }
}

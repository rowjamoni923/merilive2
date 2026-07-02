import 'package:flutter/material.dart';

/// Flutter port of `PictureInPictureButton.tsx`. On Android this triggers the
/// platform PiP mode (host activity request). The button here is the visible
/// UI trigger — actual PiP entry is dispatched via a platform channel call
/// provided by the caller (e.g. LiveKitPlugin.enterPip).
class PictureInPictureButton extends StatelessWidget {
  final VoidCallback onEnterPip;
  final bool supported;
  const PictureInPictureButton({
    super.key,
    required this.onEnterPip,
    this.supported = true,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: supported ? 1 : 0.4,
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withOpacity(0.35),
        ),
        child: IconButton(
          onPressed: supported ? onEnterPip : null,
          tooltip: 'Picture-in-Picture',
          icon: const Icon(Icons.picture_in_picture_alt,
              color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

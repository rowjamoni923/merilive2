import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../data/live_chat_bridge.dart';

/// A2 — Bottom-left scrolling chat overlay.
/// Auto-sticks to the latest message; user-scroll releases stickiness.
class LiveChatOverlay extends StatefulWidget {
  const LiveChatOverlay({
    super.key,
    required this.messages,
    this.maxHeight = 260,
    this.onUserTap,
  });

  final List<LiveChatMessage> messages;
  final double maxHeight;
  /// H5 P0 #4 — fires when a viewer name is tapped so the parent can open
  /// `PremiumViewerProfileCard`.
  final void Function(String userId, String displayName)? onUserTap;

  @override
  State<LiveChatOverlay> createState() => _LiveChatOverlayState();
}

class _LiveChatOverlayState extends State<LiveChatOverlay> {
  final _controller = ScrollController();
  bool _stickToBottom = true;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());
  }

  @override
  void didUpdateWidget(covariant LiveChatOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.messages.length != oldWidget.messages.length && _stickToBottom) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());
    }
  }

  void _onScroll() {
    if (!_controller.hasClients) return;
    final atBottom = _controller.position.pixels >=
        _controller.position.maxScrollExtent - 32;
    if (atBottom != _stickToBottom) {
      setState(() => _stickToBottom = atBottom);
    }
  }

  void _scrollToEnd() {
    if (!_controller.hasClients) return;
    _controller.jumpTo(_controller.position.maxScrollExtent);
  }

  @override
  void dispose() {
    _controller.removeListener(_onScroll);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: widget.maxHeight),
      child: ShaderMask(
        shaderCallback: (rect) => const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Colors.black, Colors.black],
          stops: [0.0, 0.12, 1.0],
        ).createShader(rect),
        blendMode: BlendMode.dstIn,
        child: ListView.builder(
          controller: _controller,
          padding: const EdgeInsets.only(bottom: 4),
          itemCount: widget.messages.length,
          itemBuilder: (context, i) => _ChatBubble(
            msg: widget.messages[i],
            onUserTap: widget.onUserTap,
          ),
        ),
      ),
    );
  }
}

class _ChatBubble extends StatefulWidget {
  const _ChatBubble({required this.msg, this.onUserTap});
  final LiveChatMessage msg;
  final void Function(String userId, String displayName)? onUserTap;

  @override
  State<_ChatBubble> createState() => _ChatBubbleState();
}

class _ChatBubbleState extends State<_ChatBubble> {
  TapGestureRecognizer? _nameTap;

  @override
  void dispose() {
    _nameTap?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final msg = widget.msg;
    final isSystem = msg.type == 'system';
    final isGift = msg.type == 'gift';

    if (isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            msg.message,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11.5,
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      );
    }

    final nameColor =
        isGift ? const Color(0xFFFCD34D) : const Color(0xFF93C5FD);

    // H5 P0 #4 — attach tap recognizer to the name span when we know the
    // sender's userId and a parent handler is wired.
    final tappable = widget.onUserTap != null && msg.userId != null;
    if (tappable) {
      _nameTap ??= TapGestureRecognizer()
        ..onTap = () => widget.onUserTap!(msg.userId!, msg.displayName);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.42),
          borderRadius: BorderRadius.circular(14),
        ),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12.5,
              height: 1.25,
            ),
            children: [
              if (msg.level > 0)
                WidgetSpan(
                  alignment: PlaceholderAlignment.middle,
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [
                        Color(0xFF6366F1),
                        Color(0xFFA855F7),
                      ]),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'Lv.${msg.level}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              TextSpan(
                text: '${msg.displayName}: ',
                style: TextStyle(
                  color: nameColor,
                  fontWeight: FontWeight.w700,
                ),
                recognizer: tappable ? _nameTap : null,
              ),
              TextSpan(text: msg.message),
            ],
          ),
        ),
      ),
    );
  }
}


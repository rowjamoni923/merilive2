import 'package:flutter/material.dart';

/// A2 — Compact chat composer for viewers. Host uses the action-bar
/// (A3) so this widget is viewer-only.
class LiveChatComposer extends StatefulWidget {
  const LiveChatComposer({super.key, required this.onSend});
  final Future<void> Function(String text) onSend;

  @override
  State<LiveChatComposer> createState() => _LiveChatComposerState();
}

class _LiveChatComposerState extends State<LiveChatComposer> {
  final _controller = TextEditingController();
  bool _sending = false;

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _controller.clear();
    try {
      await widget.onSend(text);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message failed to send')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              maxLength: 200,
              minLines: 1,
              maxLines: 3,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _submit(),
              style: const TextStyle(color: Colors.white, fontSize: 13.5),
              decoration: const InputDecoration(
                counterText: '',
                border: InputBorder.none,
                isCollapsed: true,
                hintText: 'Say something…',
                hintStyle: TextStyle(color: Colors.white54, fontSize: 13.5),
              ),
            ),
          ),
          const SizedBox(width: 6),
          InkResponse(
            radius: 22,
            onTap: _sending ? null : _submit,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [
                  Color(0xFFEC4899),
                  Color(0xFF8B5CF6),
                ]),
                shape: BoxShape.circle,
              ),
              child: _sending
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_rounded,
                      color: Colors.white, size: 16),
            ),
          ),
        ],
      ),
    );
  }
}
